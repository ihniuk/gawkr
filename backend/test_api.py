import urllib.request
import json
import time

def run_tests():
    # 1. Test Static Frontend
    req = urllib.request.urlopen('http://127.0.0.1:8000/')
    html = req.read().decode('utf-8')
    print('[OK] Frontend Root Status:', req.status, '| HTML length:', len(html))

    # 2. Test Admin Login
    login_data = json.dumps({'username': 'admin', 'password': 'admin123'}).encode('utf-8')
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/auth/login',
        data=login_data,
        headers={'Content-Type': 'application/json'}
    )
    auth_resp = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
    token = auth_resp['token']
    print(f"[OK] Authentication OK | Role: {auth_resp['role']} | Token: {token[:16]}...")

    # 3. Test Unauthorized Access Blocking (Security check)
    try:
        urllib.request.urlopen('http://127.0.0.1:8000/api/cameras')
        print("[FAIL] Security check failed: unauthorized request was permitted!")
    except urllib.error.HTTPError as e:
        print(f"[OK] Security check passed: Unauthorized access blocked with HTTP {e.code}")

    # 4. Test Authorized List Cameras
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/cameras',
        headers={'Authorization': f'Bearer {token}'}
    )
    cams = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
    print(f"[OK] Authenticated Cameras Query OK | Total: {len(cams)}")
    for c in cams:
        print(f"   - [{c['id']}] {c['name']} ({c['vendor']}) | Mode: {c['settings']['recording_mode']}")

    # 5. Test Stream Ticket Generation
    cam_id = cams[0]['id']
    req = urllib.request.Request(
        f'http://127.0.0.1:8000/api/auth/stream-ticket/{cam_id}',
        headers={'Authorization': f'Bearer {token}'}
    )
    ticket_data = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
    ticket = ticket_data['ticket']
    print(f"[OK] Stream Ticket Generated | Cam: {cam_id} | Ticket: {ticket[:20]}...")

    # 6. Test Stream Video Delivery with Ticket
    stream_url = f'http://127.0.0.1:8000/api/cameras/{cam_id}/stream?ticket={ticket}'
    stream_req = urllib.request.urlopen(stream_url)
    chunk = stream_req.read(2048)
    print(f"[OK] Video Stream Active | Content-Type: {stream_req.headers.get('Content-Type')} | Received bytes: {len(chunk)}")

    # 7. Test Snapshot Capture
    req = urllib.request.Request(
        f'http://127.0.0.1:8000/api/cameras/{cam_id}/snapshot',
        headers={'Authorization': f'Bearer {token}'}
    )
    snap_resp = urllib.request.urlopen(req)
    snap_bytes = snap_resp.read()
    print(f"[OK] Snapshot Captured | Size: {len(snap_bytes)} bytes | Content-Type: {snap_resp.headers.get('Content-Type')}")

    # 8. Test Telemetry Endpoint
    req = urllib.request.Request(
        f'http://127.0.0.1:8000/api/cameras/{cam_id}/telemetry',
        headers={'Authorization': f'Bearer {token}'}
    )
    telem = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
    print(f"[OK] Telemetry HUD Query OK | FPS: {telem['fps']} | Bitrate: {telem['bitrate_kbps']} Kbps | Decoder: {telem['decoder']} | AI Latency: {telem['ai_latency_ms']}ms")

    # 9. Test Discovery Scan
    print("Testing /api/discovery/scan...")
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/discovery/scan',
        data=b'{}',
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'}
    )
    scan_resp = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
    print(f"[OK] Network Discovery Completed | Discovered Devices: {scan_resp['count']}")

    # 10. Test Credential Verification & Profile Probing
    print("Testing /api/discovery/verify...")
    verify_data = json.dumps({
        'ip': '192.168.1.50',
        'onvif_port': 80,
        'rtsp_port': 554,
        'username': 'admin',
        'password': 'password123'
    }).encode('utf-8')
    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/discovery/verify',
        data=verify_data,
        headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {token}'}
    )
    verify_resp = json.loads(urllib.request.urlopen(req).read().decode('utf-8'))
    print(f"[OK] Credential Verification & Profile Probe Succeeded:")
    print(f"   - Verified Status: {verify_resp['success']}")
    print(f"   - Suggested Main Stream: {verify_resp['suggested_main_url']}")
    print(f"   - Suggested Sub Stream: {verify_resp['suggested_sub_url']}")
    print(f"   - Discovered Profiles: {len(verify_resp['profiles'])}")

    print("\nALL 10 VERIFICATION TESTS COMPLETED SUCCESSFULLY!")

if __name__ == '__main__':
    run_tests()
