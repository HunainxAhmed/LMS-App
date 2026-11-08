from fastapi import APIRouter
from app.api.v1.endpoints import (
    auth,
    lms,
    dashboard,
    academic,
    sync,
    notifications,
    downloads,
    app_version,
)

api_router = APIRouter()

api_router.include_router(auth.router)
api_router.include_router(lms.router)
api_router.include_router(dashboard.router)
api_router.include_router(academic.router)
api_router.include_router(sync.router)
api_router.include_router(notifications.router)
api_router.include_router(downloads.router)
api_router.include_router(app_version.router)
