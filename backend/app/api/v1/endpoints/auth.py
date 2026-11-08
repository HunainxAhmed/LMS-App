from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database.session import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from app.models.user import User, UserNotificationPreference, UniversityAccount
from app.schemas.auth import (
    UserRegister,
    UserLogin,
    TokenResponse,
    RefreshTokenRequest,
    UserProfileResponse,
    UniversityAccountSummary,
    ChangePasswordRequest,
)
from app.api.deps import get_current_user

router = APIRouter(prefix="/auth", tags=["Authentication"])

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user_in.email.lower().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email already exists."
        )

    user = User(
        email=user_in.email.lower().strip(),
        hashed_password=get_password_hash(user_in.password),
        is_active=True,
    )
    db.add(user)
    db.flush()

    # Create default notification preferences
    prefs = UserNotificationPreference(user_id=user.id)
    db.add(prefs)
    db.commit()
    db.refresh(user)

    access_token = create_access_token({"sub": user.id, "email": user.email})
    refresh_token, _ = create_refresh_token({"sub": user.id, "email": user.email})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=60 * 24 * 60,
    )

@router.post("/login", response_model=TokenResponse)
def login(user_in: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_in.email.lower().strip()).first()
    if not user or not verify_password(user_in.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account has been deactivated."
        )

    access_token = create_access_token({"sub": user.id, "email": user.email})
    refresh_token, _ = create_refresh_token({"sub": user.id, "email": user.email})

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        expires_in=60 * 24 * 60,
    )

@router.post("/refresh", response_model=TokenResponse)
def refresh_token(req: RefreshTokenRequest, db: Session = Depends(get_db)):
    payload = decode_token(req.refresh_token)
    if not payload or payload.get("type") != "refresh":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token."
        )

    user_id = payload.get("sub")
    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    new_access_token = create_access_token({"sub": user.id, "email": user.email})
    new_refresh_token, _ = create_refresh_token({"sub": user.id, "email": user.email})

    return TokenResponse(
        access_token=new_access_token,
        refresh_token=new_refresh_token,
        expires_in=60 * 24 * 60,
    )

@router.get("/me", response_model=UserProfileResponse)
def get_current_profile(current_user: User = Depends(get_current_user)):
    acc_summary = None
    if current_user.university_account:
        acc = current_user.university_account
        acc_summary = UniversityAccountSummary(
            id=acc.id,
            enrollment=acc.enrollment,
            campus_id=acc.campus_id,
            campus_name=acc.campus_name,
            full_name=acc.full_name or "",
            program=acc.program or "",
            current_semester=acc.current_semester or "",
            cloud_monitoring_enabled=acc.cloud_monitoring_enabled,
            last_synced_at=acc.last_synced_at.isoformat() if acc.last_synced_at else None,
            last_sync_status=acc.last_sync_status,
        )

    return UserProfileResponse(
        id=current_user.id,
        email=current_user.email,
        is_active=current_user.is_active,
        university_account=acc_summary,
    )

@router.post("/change-password")
def change_password(
    req: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not verify_password(req.old_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password incorrect")

    current_user.hashed_password = get_password_hash(req.new_password)
    db.commit()
    return {"success": True, "message": "Password updated successfully"}
