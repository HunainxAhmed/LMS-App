import sys
import asyncio
import uvicorn
from app.core.config import settings

if __name__ == "__main__":
    loop_param = "asyncio:ProactorEventLoop" if sys.platform == "win32" else "auto"
    if sys.platform == "win32":
        try:
            asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())
        except Exception:
            pass

    print(f"Starting {settings.PROJECT_NAME} on http://{settings.HOST}:{settings.PORT}")
    print(f"API Docs available at http://localhost:{settings.PORT}{settings.API_V1_STR}/docs")
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=False,
        loop=loop_param,
    )

