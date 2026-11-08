import asyncio
import logging
from datetime import datetime, timezone, timedelta
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from app.database.session import SessionLocal
from app.models.user import UniversityAccount
from app.services.sync_service import run_account_sync
from app.core.config import settings

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()
active_syncs = set()

async def scheduled_sync_job():
    """
    Periodic job triggered every few minutes.
    Discovers all university accounts with cloud monitoring enabled,
    and runs synchronization if their interval has elapsed.
    """
    logger.debug("Running scheduled cloud sync check...")
    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        accounts = db.query(UniversityAccount).filter(
            UniversityAccount.cloud_monitoring_enabled == True
        ).all()

        for acc in accounts:
            if acc.id in active_syncs:
                continue

            interval_min = acc.sync_interval_minutes or settings.DEFAULT_SYNC_INTERVAL_MINUTES
            due = False
            if not acc.last_synced_at:
                due = True
            elif (now - acc.last_synced_at.replace(tzinfo=timezone.utc if acc.last_synced_at.tzinfo is None else acc.last_synced_at.tzinfo)) >= timedelta(minutes=interval_min):
                due = True

            if due:
                active_syncs.add(acc.id)
                asyncio.create_task(run_background_sync(acc.id))

    except Exception as e:
        logger.error(f"Scheduled sync error: {e}")
    finally:
        db.close()

async def run_background_sync(account_id: str):
    db = SessionLocal()
    try:
        acc = db.query(UniversityAccount).filter(UniversityAccount.id == account_id).first()
        if acc and acc.cloud_monitoring_enabled:
            logger.info(f"Running background sync for student {acc.enrollment} ({acc.campus_name})...")
            await run_account_sync(db, acc, trigger_type="SCHEDULED")
    except Exception as e:
        logger.error(f"Background sync exception for account {account_id}: {e}")
    finally:
        active_syncs.discard(account_id)
        db.close()

def start_scheduler():
    """Starts the background scheduler."""
    if not scheduler.running:
        scheduler.add_job(
            scheduled_sync_job,
            "interval",
            minutes=2,
            id="cloud_sync_scheduler",
            replace_existing=True
        )
        scheduler.start()
        logger.info("CampusFlow Background Cloud Sync Scheduler started.")

def stop_scheduler():
    """Stops the background scheduler."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("CampusFlow Background Cloud Sync Scheduler stopped.")
