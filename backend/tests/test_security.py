import pytest
from app.core.security import (
    encrypt_credential,
    decrypt_credential,
    verify_password,
    get_password_hash,
    create_access_token,
    decode_token,
)
from cryptography.exceptions import InvalidTag

def test_aes_gcm_encryption_roundtrip():
    secret = "SuperSecretUniversityPassword123!@#"
    enc = encrypt_credential(secret)

    assert "ciphertext" in enc
    assert "nonce" in enc
    assert enc["key_version"] == 1
    assert enc["ciphertext"] != secret

    decrypted = decrypt_credential(enc["ciphertext"], enc["nonce"])
    assert decrypted == secret

def test_aes_gcm_unique_nonce_per_encryption():
    secret = "MySamePassword"
    enc1 = encrypt_credential(secret)
    enc2 = encrypt_credential(secret)

    # Every encryption MUST have a distinct cryptographically secure nonce and ciphertext
    assert enc1["nonce"] != enc2["nonce"]
    assert enc1["ciphertext"] != enc2["ciphertext"]
    assert decrypt_credential(enc1["ciphertext"], enc1["nonce"]) == secret
    assert decrypt_credential(enc2["ciphertext"], enc2["nonce"]) == secret

def test_aes_gcm_tamper_detection():
    secret = "ConfidentialAcademicData"
    enc = encrypt_credential(secret)

    # Tamper with the ciphertext (flip a byte)
    tampered = list(enc["ciphertext"])
    tampered[10] = 'X' if tampered[10] != 'X' else 'Y'
    tampered_b64 = "".join(tampered)

    # AES-GCM must reject tampered ciphertext with InvalidTag or decryption failure
    with pytest.raises(Exception):
        decrypt_credential(tampered_b64, enc["nonce"])

def test_password_hashing():
    pwd = "CampusFlowUserPass2025"
    hashed = get_password_hash(pwd)

    assert hashed != pwd
    assert verify_password(pwd, hashed) is True
    assert verify_password("WrongPassword", hashed) is False

def test_jwt_generation_and_decoding():
    payload = {"sub": "user_12345", "email": "student@bahria.edu.pk"}
    token = create_access_token(payload)

    decoded = decode_token(token)
    assert decoded is not None
    assert decoded["sub"] == "user_12345"
    assert decoded["email"] == "student@bahria.edu.pk"
    assert decoded["type"] == "access"

def test_invalid_jwt_rejected():
    invalid = decode_token("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid.signature")
    assert invalid is None
