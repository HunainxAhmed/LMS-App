import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.database.session import get_db, SessionLocal
from app.api.deps import get_current_university_account
from app.models.user import UniversityAccount
from app.models.sync import SyncJob
from app.schemas.sync import SyncTriggerRequest, SyncStatusResponse
from app.services.sync_service import run_account_sync

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["Synchronization"])

@router.post("", response_model=SyncStatusResponse)
async def trigger_sync(
    req: SyncTriggerRequest,
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    """
    Triggers an immediate asynchronous synchronization run.
    Returns immediately so the client can stream real-time step progress
    without blocking or freezing the mobile UI.
    """
    override_pwd = None
    if req.credentials:
        override_pwd = req.credentials.password

    # Check if a sync job is already actively running for this student
    active_job = db.query(SyncJob).filter(
        SyncJob.account_id == account.id,
        SyncJob.status == "RUNNING"
    ).order_by(SyncJob.started_at.desc()).first()

    if active_job:
        now = datetime.now(timezone.utc)
        job_start = active_job.started_at
        if job_start and job_start.tzinfo is None:
            job_start = job_start.replace(tzinfo=timezone.utc)

        # If job has been running for > 60 seconds or force_fresh_login is requested, clear stale lock
        if req.force_fresh_login or (job_start and (now - job_start).total_seconds() > 60):
            active_job.status = "FAILED"
            active_job.error_message = "Previous sync timed out"
            active_job.completed_at = now
            db.commit()
            logger.warning(f"Cleared timed-out sync job {active_job.id} for account {account.id}")
        else:
            return SyncStatusResponse(
                job_id=active_job.id,
                status=active_job.status,
                current_step=active_job.current_step,
                assignments_count=active_job.assignments_count,
                attendance_count=active_job.attendance_count,
                materials_count=active_job.materials_count,
                error_message=active_job.error_message,
                started_at=active_job.started_at,
                completed_at=active_job.completed_at,
            )

    # Create job in database immediately
    job = SyncJob(
        account_id=account.id,
        trigger_type="MANUAL",
        status="RUNNING",
        current_step="Connecting to university portal...",
        started_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    # Launch background task with independent DB session
    account_id = account.id
    job_id = job.id
    force_fresh = req.force_fresh_login

    async def _async_sync_worker():
        task_db = SessionLocal()
        try:
            acc = task_db.query(UniversityAccount).filter(UniversityAccount.id == account_id).first()
            task_job = task_db.query(SyncJob).filter(SyncJob.id == job_id).first()
            if acc and task_job:
                await run_account_sync(
                    db=task_db,
                    account=acc,
                    trigger_type="MANUAL",
                    force_fresh=force_fresh,
                    override_password=override_pwd,
                    existing_job=task_job,
                )
        except Exception as e:
            logger.error(f"Background sync failed for account {account_id}: {e}")
            try:
                task_job = task_db.query(SyncJob).filter(SyncJob.id == job_id).first()
                if task_job and task_job.status == "RUNNING":
                    task_job.status = "FAILED"
                    task_job.error_message = str(e)
                    task_job.completed_at = datetime.now(timezone.utc)
                    task_db.commit()
            except Exception:
                pass
        finally:
            task_db.close()

    asyncio.create_task(_async_sync_worker())

    return SyncStatusResponse(
        job_id=job.id,
        status=job.status,
        current_step=job.current_step,
        assignments_count=job.assignments_count,
        attendance_count=job.attendance_count,
        materials_count=job.materials_count,
        error_message=job.error_message,
        started_at=job.started_at,
        completed_at=job.completed_at,
    )

@router.get("/status", response_model=SyncStatusResponse)
def get_sync_status(
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    """Returns the most recent sync job status for this account."""
    latest_job = db.query(SyncJob).filter(
        SyncJob.account_id == account.id
    ).order_by(SyncJob.started_at.desc()).first()

    if not latest_job:
        raise HTTPException(status_code=404, detail="No sync jobs recorded yet")

    return SyncStatusResponse(
        job_id=latest_job.id,
        status=latest_job.status,
        current_step=latest_job.current_step,
        assignments_count=latest_job.assignments_count,
        attendance_count=latest_job.attendance_count,
        materials_count=latest_job.materials_count,
        error_message=latest_job.error_message,
        started_at=latest_job.started_at,
        completed_at=latest_job.completed_at,
    )
