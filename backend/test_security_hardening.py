import unittest
import time
import jwt
from app.config import JWT_SECRET, JWT_ALGORITHM, resolve_cors_origins
from app.auth import (
    create_access_token, decode_access_token,
    create_2fa_challenge_token, verify_2fa_challenge_token,
    create_stream_ticket, verify_stream_ticket,
    extract_client_ip
)

class MockRequest:
    def __init__(self, headers=None, client_host=None):
        self.headers = headers or {}
        if client_host:
            class Client:
                host = client_host
            self.client = Client()
        else:
            self.client = None

class TestSecurityHardening(unittest.TestCase):

    def test_ip_extraction_cloudflare_priority(self):
        # 1. CF-Connecting-IP beats True-Client-IP, X-Real-IP, and X-Forwarded-For
        req = MockRequest(headers={
            "cf-connecting-ip": "203.0.113.10",
            "true-client-ip": "198.51.100.20",
            "x-real-ip": "10.0.0.1",
            "x-forwarded-for": "10.0.0.2, 10.0.0.3"
        })
        self.assertEqual(extract_client_ip(req), "203.0.113.10")

        # 2. True-Client-IP beats X-Real-IP and X-Forwarded-For
        req2 = MockRequest(headers={
            "true-client-ip": "198.51.100.20",
            "x-real-ip": "10.0.0.1",
            "x-forwarded-for": "10.0.0.2, 10.0.0.3"
        })
        self.assertEqual(extract_client_ip(req2), "198.51.100.20")

        # 3. X-Real-IP beats X-Forwarded-For
        req3 = MockRequest(headers={
            "x-real-ip": "10.0.0.1",
            "x-forwarded-for": "10.0.0.2, 10.0.0.3"
        })
        self.assertEqual(extract_client_ip(req3), "10.0.0.1")

        # 4. X-Forwarded-For extracts rightmost proxy entry
        req4 = MockRequest(headers={
            "x-forwarded-for": "1.1.1.1, 2.2.2.2, 3.3.3.3"
        })
        self.assertEqual(extract_client_ip(req4), "3.3.3.3")

        # 5. Fallback to client.host
        req5 = MockRequest(client_host="192.168.1.100")
        self.assertEqual(extract_client_ip(req5), "192.168.1.100")

        # 6. Fallback to 127.0.0.1 when no client host is available
        req6 = MockRequest()
        self.assertEqual(extract_client_ip(req6), "127.0.0.1")

    def test_jwt_token_type_enforcement(self):
        # 1. create_access_token contains "typ": "access"
        token = create_access_token({"sub": "admin", "role": "admin"})
        payload = decode_access_token(token)
        self.assertIsNotNone(payload)
        self.assertEqual(payload.get("typ"), "access")

        # 2. decode_access_token strictly rejects tokens without typ=="access"
        # 2FA challenge token:
        ch_token = create_2fa_challenge_token("admin", "admin")
        self.assertIsNone(decode_access_token(ch_token))

        # Stream ticket:
        stream_tok = create_stream_ticket("cam_01", "admin")
        self.assertIsNone(decode_access_token(stream_tok))

        # Untyped token:
        untyped = jwt.encode({"sub": "admin", "role": "admin", "exp": time.time() + 3600}, JWT_SECRET, algorithm=JWT_ALGORITHM)
        self.assertIsNone(decode_access_token(untyped))

        # 3. verify_2fa_challenge_token strictly requires typ=="2fa_challenge"
        ch_verified = verify_2fa_challenge_token(ch_token)
        self.assertIsNotNone(ch_verified)
        self.assertEqual(ch_verified.get("typ"), "2fa_challenge")

        # Rejects access tokens and stream tickets
        self.assertIsNone(verify_2fa_challenge_token(token))
        self.assertIsNone(verify_2fa_challenge_token(stream_tok))

    def test_cors_configuration(self):
        origins = resolve_cors_origins()
        self.assertIn("https://cams.ihni.uk", origins)

if __name__ == "__main__":
    unittest.main()
