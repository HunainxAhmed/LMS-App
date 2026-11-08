import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.api.deps import get_current_university_account
from app.models.user import UniversityAccount
from app.models.sync import SyncJob
from app.schemas.sync import SyncTriggerRequest, SyncStatusResponse
from app.services.sync_service import run_account_sync

router = APIRouter(prefix="/sync", tags=["Synchronization"])

@router.post("", response_model=SyncStatusResponse)
async def trigger_sync(
    req: SyncTriggerRequest,
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    """
    Triggers an immediate synchronization run.
    If in Local-Only mode, uses credentials passed in request.
    If in Cloud-Monitoring mode, decrypts stored credentials.
    """
    override_pwd = None
    if req.credentials:
        override_pwd = req.credentials.password

    # Run synchronization
    job = await run_account_sync(
        db=db,
        account=account,
        trigger_type="MANUAL",
        force_fresh=req.force_fresh_login,
        override_password=override_pwd
    )

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
