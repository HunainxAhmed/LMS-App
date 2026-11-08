import logging
from typing import List, Dict, Any, Optional
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

async def send_expo_push_notification(
    push_tokens: List[str],
    title: str,
    body: str,
    data: Optional[Dict[str, Any]] = None,
    channel_id: str = "default",
    sound: str = "default",
    priority: str = "high"
) -> List[Dict[str, Any]]:
    """
    Sends remote push notifications via Expo Push API.
    Works for installable development APK / production EAS builds.
    Returns delivery ticket summaries.
    """
    if not push_tokens:
        return []

    if not settings.ENABLE_REMOTE_PUSH:
        logger.info(f"[SIMULATED PUSH] Title: '{title}' | Body: '{body}' | Tokens: {len(push_tokens)}")
        return [{"status": "ok", "simulated": True, "token": t} for t in push_tokens]

    messages = []
    for token in push_tokens:
        # Validate standard Expo token format
        if not token.startswith("ExponentPushToken[") and not token.startswith("ExpoPushToken["):
            logger.warning(f"Skipping invalid Expo push token: {token}")
            continue

        msg = {
            "to": token,
            "title": title,
            "body": body,
            "data": data or {},
            "sound": sound,
            "priority": priority,
            "channelId": channel_id,
        }
        messages.append(msg)

    if not messages:
        return []

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                settings.EXPO_PUSH_API_URL,
                json=messages,
                headers={
                    "Accept": "application/json",
                    "Accept-Encoding": "gzip, deflate",
                    "Content-Type": "application/json",
                }
            )
            if resp.status_code == 200:
                result = resp.json()
                logger.info(f"Expo push API returned: {result}")
                tickets = result.get("data", [])
                return tickets
            else:
                logger.error(f"Expo Push API HTTP error {resp.status_code}: {resp.text}")
                return [{"status": "error", "message": resp.text}]
    except Exception as e:
        logger.error(f"Expo push notification failed: {e}")
        return [{"status": "error", "message": str(e)}]
