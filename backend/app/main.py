import sys
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
    except Exception:
        pass
from app.core.config import settings
from app.database.session import engine, Base
from app.models import *  # Ensure all models are registered with Base.metadata
from app.api.v1.api import api_router
from app.notifications.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("campusflow")

def _ensure_playwright_binary():
    """Background task to ensure Playwright Chromium browser is installed on Linux/Render."""
    if sys.platform != "win32":
        try:
            logger.info("Verifying Playwright Chromium browser binary on host...")
            import subprocess
            res = subprocess.run(
                [sys.executable, "-m", "playwright", "install", "chromium"],
                capture_output=True,
                text=True,
                timeout=180
            )
            if res.returncode == 0:
                logger.info("Playwright Chromium browser successfully installed and verified.")
            else:
                logger.warning(f"Playwright install completed with code {res.returncode}: {res.stderr[:200]}")
        except Exception as e:
            logger.warning(f"Playwright background verification note: {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Ensure Playwright browser binary in background on Linux/Render
    if sys.platform != "win32":
        asyncio.create_task(asyncio.to_thread(_ensure_playwright_binary))

    # Startup: Initialize Database Tables
    logger.info("Initializing CampusFlow database tables...")
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables initialized successfully.")

    # Ensure any newly added columns exist in SQLite database
    try:
        with engine.connect() as conn:
            from sqlalchemy import text
            res = conn.execute(text("PRAGMA table_info(attendance_records);")).fetchall()
            existing_cols = {r[1] for r in res}
            cols_to_add = [
                ("credit_hours", "FLOAT DEFAULT 3.0"),
                ("total_semester_hours", "FLOAT DEFAULT 48.0"),
                ("fine_skips", "INTEGER DEFAULT 7"),
                ("fine_amount", "INTEGER DEFAULT 0"),
            ]
            for col_name, col_def in cols_to_add:
                if col_name not in existing_cols:
                    conn.execute(text(f"ALTER TABLE attendance_records ADD COLUMN {col_name} {col_def};"))
                    conn.commit()
                    logger.info(f"Added column {col_name} to attendance_records")
    except Exception as e:
        logger.debug(f"Column check note: {e}")

    # Startup: Launch Background Cloud Sync Scheduler
    logger.info("Starting background cloud sync scheduler...")
    start_scheduler()

    yield

    # Shutdown
    logger.info("Shutting down background scheduler...")
    stop_scheduler()

app = FastAPI(
    title=settings.PROJECT_NAME,
    description="CampusFlow — Unofficial Bahria University Student Companion Backend API. High-performance scraping, notifications, and academic dashboard.",
    version="1.0.0",
    openapi_url=f"{settings.API_V1_STR}/openapi.json",
    docs_url=f"{settings.API_V1_STR}/docs",
    redoc_url=f"{settings.API_V1_STR}/redoc",
    lifespan=lifespan,
)

# CORS setup for Expo Go / mobile clients across local Wi-Fi
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register v1 API Router
app.include_router(api_router, prefix=settings.API_V1_STR)

@app.get("/")
def root():
    return {
        "app": "CampusFlow",
        "tagline": "Your University, Organized.",
        "affiliation": "Unofficial Bahria University Student Companion",
        "version": "1.0.0",
        "api_docs": f"{settings.API_V1_STR}/docs",
        "status": "online"
    }

@app.get("/health")
def health_check():
    karachi_time = datetime.now(ZoneInfo(settings.APP_TIMEZONE))
    return {
        "status": "healthy",
        "server_time_karachi": karachi_time.isoformat(),
        "database": "connected",
        "cloud_sync_scheduler": "active",
    }
