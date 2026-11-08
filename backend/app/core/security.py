import os
import base64
import hashlib
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, Dict, Any
import bcrypt
from jose import jwt, JWTError
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.core.config import settings

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify an internal CampusFlow user password."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8")[:72],
            hashed_password.encode("utf-8")
        )
    except Exception:
        return False

def get_password_hash(password: str) -> str:
    """Hash an internal CampusFlow user password using bcrypt with salt."""
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode("utf-8")[:72], salt)
    return hashed.decode("utf-8")

def hash_token(token: str) -> str:
    """Hash a refresh token or API token with SHA-256 before DB storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

# JWT Token Generation & Verification
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire, "iat": now, "type": "access"})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt

def create_refresh_token(data: dict) -> Tuple[str, datetime]:
    to_encode = data.copy()
    now = datetime.now(timezone.utc)
    expire = now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS)
    to_encode.update({"exp": expire, "iat": now, "type": "refresh"})
    encoded_jwt = jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
    return encoded_jwt, expire

def decode_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return payload
    except JWTError:
        return None

# ==============================================================================
# AES-256-GCM CREDENTIAL ENCRYPTION (FOR OPT-IN CLOUD MONITORING)
# ==============================================================================
KEY_VERSION = 1

def _get_encryption_key() -> bytes:
    """
    Derives or parses a 32-byte AES-256 key from settings.
    Accepts hex, base64, or uses SHA256 derivation.
    """
    raw = settings.ENCRYPTION_MASTER_KEY
    if not raw:
        raise ValueError("ENCRYPTION_MASTER_KEY is not configured in environment.")

    # Try 32 bytes hex
    if len(raw) == 64:
        try:
            return bytes.fromhex(raw)
        except ValueError:
            pass

    # Try base64
    try:
        decoded = base64.urlsafe_b64decode(raw)
        if len(decoded) == 32:
            return decoded
    except Exception:
        pass

    # Fallback: SHA-256 derivation ensures exact 32 bytes
    return hashlib.sha256(raw.encode("utf-8")).digest()

def encrypt_credential(plaintext: str) -> Dict[str, str]:
    """
    Encrypts sensitive data (such as university password or session cookies)
    using AES-256-GCM with a freshly generated 12-byte cryptographically secure nonce.
    Returns:
        {
            "ciphertext": base64_str,
            "nonce": base64_str,
            "key_version": 1
        }
    """
    if not plaintext:
        raise ValueError("Cannot encrypt empty credential.")

    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    # Generate unique 96-bit (12-byte) nonce
    nonce = os.urandom(12)
    # AESGCM encrypt appends the 16-byte authentication tag to the ciphertext
    encrypted_bytes = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)

    return {
        "ciphertext": base64.b64encode(encrypted_bytes).decode("ascii"),
        "nonce": base64.b64encode(nonce).decode("ascii"),
        "key_version": KEY_VERSION
    }

def decrypt_credential(ciphertext_b64: str, nonce_b64: str) -> str:
    """
    Decrypts AES-256-GCM encrypted credential back to plaintext in-memory.
    Never logs or persists the returned string.
    """
    if not ciphertext_b64 or not nonce_b64:
        raise ValueError("Missing ciphertext or nonce for decryption.")

    key = _get_encryption_key()
    aesgcm = AESGCM(key)
    ciphertext = base64.b64decode(ciphertext_b64.encode("ascii"))
    nonce = base64.b64decode(nonce_b64.encode("ascii"))

    decrypted_bytes = aesgcm.decrypt(nonce, ciphertext, None)
    return decrypted_bytes.decode("utf-8")
