from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.api.deps import get_current_user, get_current_university_account
from app.models.user import User, UniversityAccount, DevicePushToken, UserNotificationPreference
from app.models.notification import NotificationEvent
from app.schemas.notification import (
    NotificationEventSchema,
    NotificationListResponse,
    MarkReadRequest,
    DeviceRegisterRequest,
    UserPreferencesSchema,
    TestPushRequest,
)
from app.notifications.expo_pusher import send_expo_push_notification

router = APIRouter(tags=["Notifications & Devices"])

# ==============================================================================
# NOTIFICATION INBOX
# ==============================================================================
@router.get("/notifications", response_model=NotificationListResponse)
def get_notifications(
    category: Optional[str] = Query(None, description="all, unread, assignments, attendance, materials"),
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    query = db.query(NotificationEvent).filter(NotificationEvent.account_id == account.id)

    if category == "unread":
        query = query.filter(NotificationEvent.is_read == False)
    elif category == "assignments":
        query = query.filter(NotificationEvent.category.like("%ASSIGNMENT%"))
    elif category == "attendance":
        query = query.filter(NotificationEvent.category.like("%ATTENDANCE%"))
    elif category == "materials":
        query = query.filter(NotificationEvent.category.like("%MATERIAL%"))

    total = query.count()
    unread_count = db.query(NotificationEvent).filter(
        NotificationEvent.account_id == account.id,
        NotificationEvent.is_read == False
    ).count()

    notifications = query.order_by(NotificationEvent.created_at.desc()).offset(offset).limit(limit).all()

    return NotificationListResponse(
        total=total,
        unread_count=unread_count,
        notifications=[NotificationEventSchema.from_orm(n) for n in notifications]
    )

@router.post("/notifications/read")
def mark_notifications_read(
    req: Optional[MarkReadRequest] = None,
    all_read: bool = False,
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    if all_read:
        db.query(NotificationEvent).filter(
            NotificationEvent.account_id == account.id
        ).update({"is_read": True})
    elif req and req.notification_ids:
        db.query(NotificationEvent).filter(
            NotificationEvent.account_id == account.id,
            NotificationEvent.id.in_(req.notification_ids)
        ).update({"is_read": True}, synchronize_session=False)

    db.commit()
    return {"success": True, "message": "Notifications marked as read"}

@router.delete("/notifications/clear-read")
def clear_read_notifications(
    db: Session = Depends(get_db),
    account: UniversityAccount = Depends(get_current_university_account)
):
    deleted_count = db.query(NotificationEvent).filter(
        NotificationEvent.account_id == account.id,
        NotificationEvent.is_read == True
    ).delete(synchronize_session=False)
    db.commit()
    return {"success": True, "deleted_count": deleted_count}

# ==============================================================================
# PREFERENCES
# ==============================================================================
@router.get("/notifications/preferences", response_model=UserPreferencesSchema)
def get_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    pref = current_user.notification_preferences
    if not pref:
        pref = UserNotificationPreference(user_id=current_user.id)
        db.add(pref)
        db.commit()
        db.refresh(pref)
    return pref

@router.put("/notifications/preferences", response_model=UserPreferencesSchema)
def update_preferences(
    pref_in: UserPreferencesSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    pref = current_user.notification_preferences
    if not pref:
        pref = UserNotificationPreference(user_id=current_user.id)
        db.add(pref)

    for field, val in pref_in.dict().items():
        setattr(pref, field, val)

    pref.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(pref)
    return pref

# ==============================================================================
# TEST PUSH NOTIFICATION
# ==============================================================================
@router.post("/notifications/test")
async def send_test_notification(
    req: TestPushRequest,
    current_user: User = Depends(get_current_user)
):
    tokens = [t.push_token for t in current_user.push_tokens if t.is_active]
    if not tokens:
        return {
            "success": False,
            "message": "No registered push tokens found for this user. Launch the mobile app on a physical device or register a token."
        }

    tickets = await send_expo_push_notification(
        push_tokens=tokens,
        title=req.title,
        body=req.body,
        data={"type": "test_alert"}
    )
    return {"success": True, "tokens_count": len(tokens), "tickets": tickets}

# ==============================================================================
# DEVICE REGISTRATION
# ==============================================================================
@router.post("/devices/register")
def register_device(
    req: DeviceRegisterRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    token = req.push_token.strip()
    existing = db.query(DevicePushToken).filter(DevicePushToken.push_token == token).first()

    if existing:
        existing.user_id = current_user.id
        existing.device_name = req.device_name
        existing.platform = req.platform
        existing.is_active = True
        existing.updated_at = datetime.now(timezone.utc)
    else:
        new_device = DevicePushToken(
            user_id=current_user.id,
            push_token=token,
            device_name=req.device_name,
            platform=req.platform,
            is_active=True,
        )
        db.add(new_device)

    db.commit()
    return {"success": True, "message": "Device push token registered successfully."}

@router.post("/devices/unregister")
def unregister_device(
    push_token: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    token = push_token.strip()
    db.query(DevicePushToken).filter(
        DevicePushToken.user_id == current_user.id,
        DevicePushToken.push_token == token
    ).update({"is_active": False})
    db.commit()
    return {"success": True, "message": "Device push token deactivated."}
