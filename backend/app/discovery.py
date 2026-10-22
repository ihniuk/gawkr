import os
import socket
import time
import re
import uuid
import asyncio
import concurrent.futures
import urllib.parse
from typing import List, Dict, Any, Optional
import xml.etree.ElementTree as ET
import cv2
import requests
from app.models import DiscoveredDevice, CredentialVerifyResponse, ProfileInfo

# WS-Discovery SOAP envelope for ONVIF
WS_DISCOVERY_PROBE = """<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:{message_id}</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action a:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe>
      <d:Types>dn:NetworkVideoTransmitter</d:Types>
    </d:Probe>
  </e:Body>
</e:Envelope>"""

SSDP_SEARCH_MSG = (
    "M-SEARCH * HTTP/1.1\r\n"
    "HOST: 239.255.255.250:1900\r\n"
    "MAN: \"ssdp:discover\"\r\n"
    "MX: 2\r\n"
    "ST: ssdp:all\r\n"
    "\r\n"
).encode('utf-8')

def get_local_ip_range() -> List[str]:
    """Finds the local private network subnet IP prefix."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        parts = local_ip.split('.')
        base = f"{parts[0]}.{parts[1]}.{parts[2]}"
        return [base]
    except Exception:
        return ["192.168.1", "192.168.0"]

async def probe_onvif_multicast(timeout: float = 2.5) -> List[DiscoveredDevice]:
    """Sends WS-Discovery multicast to locate ONVIF IP cameras."""
    discovered: Dict[str, DiscoveredDevice] = {}
    
    def _run_udp_probe():
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
        sock.settimeout(0.6)
        
        probe_xml = WS_DISCOVERY_PROBE.format(message_id=str(uuid.uuid4())).encode('utf-8')
        sock.sendto(probe_xml, ('239.255.255.250', 3702))
        
        loop_start = time.time()
        while (time.time() - loop_start) < timeout:
            try:
                data, addr = sock.recvfrom(65535)
                ip = addr[0]
                text = data.decode('utf-8', errors='ignore')
                
                # Extract XAddrs
                xaddrs = re.findall(r'<[^:]*:XAddrs>([^<]+)</[^:]*:XAddrs>', text)
                endpoint = xaddrs[0].split()[0] if xaddrs else f"http://{ip}:80/onvif/device_service"
                
                # Guess vendor from scopes
                vendor = "ONVIF Camera"
                model = "Network Camera"
                scopes = re.findall(r'<[^:]*:Scopes>([^<]+)</[^:]*:Scopes>', text)
                if scopes:
                    scope_str = scopes[0].lower()
                    if "hikvision" in scope_str:
                        vendor = "Hikvision"
                    elif "dahua" in scope_str:
                        vendor = "Dahua"
                    elif "reolink" in scope_str:
                        vendor = "Reolink"
                    elif "amcrest" in scope_str:
                        vendor = "Amcrest"
                    elif "axis" in scope_str:
                        vendor = "Axis"
                    elif "tapo" in scope_str:
                        vendor = "TP-Link Tapo"
                
                # Extract port from endpoint
                port = 80
                parsed = urllib.parse.urlparse(endpoint)
                if parsed.port:
                    port = parsed.port
                    
                discovered[ip] = DiscoveredDevice(
                    ip=ip,
                    vendor=vendor,
                    model=model,
                    onvif_port=port,
                    rtsp_port=554,
                    endpoint_url=endpoint
                )
            except socket.timeout:
                break
            except Exception:
                pass
        sock.close()
        
    await asyncio.to_thread(_run_udp_probe)
    return list(discovered.values())

async def scan_host_port(ip: str, port: int, timeout: float = 0.4) -> bool:
    try:
        _, writer = await asyncio.wait_for(
            asyncio.open_connection(ip, port),
            timeout=timeout
        )
        writer.close()
        await writer.wait_closed()
        return True
    except Exception:
        return False

async def sweep_local_subnet(bases: List[str], max_hosts: int = 50) -> List[DiscoveredDevice]:
    """Sweeps LAN IPs for RTSP (554) and ONVIF (80, 8080) ports."""
    devices = []
    tasks = []
    
    for base in bases:
        # Check first 50 common hosts in subnet
        for host in range(1, max_hosts + 1):
            ip = f"{base}.{host}"
            tasks.append(_check_ip_for_camera(ip))
            
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for r in results:
        if isinstance(r, DiscoveredDevice):
            devices.append(r)
    return devices

async def _check_ip_for_camera(ip: str) -> Optional[DiscoveredDevice]:
    has_rtsp = await scan_host_port(ip, 554, timeout=0.35)
    has_onvif = await scan_host_port(ip, 80, timeout=0.35) or await scan_host_port(ip, 8080, timeout=0.35) or await scan_host_port(ip, 8899, timeout=0.35)
    
    if has_rtsp or has_onvif:
        onvif_port = 80 if await scan_host_port(ip, 80, timeout=0.2) else (8080 if await scan_host_port(ip, 8080, timeout=0.2) else 8899)
        return DiscoveredDevice(
            ip=ip,
            vendor="Local IP Camera",
            model="RTSP/ONVIF Device",
            onvif_port=onvif_port,
            rtsp_port=554,
            endpoint_url=f"http://{ip}:{onvif_port}/onvif/device_service"
        )
    return None

async def discover_network_cameras() -> List[DiscoveredDevice]:
    """Combines WS-Discovery and subnet sweep into a consolidated device list."""
    onvif_devices = await probe_onvif_multicast(timeout=1.8)
    discovered_ips = {d.ip for d in onvif_devices}
    
    # Subnet scan for devices that don't respond to multicast
    subnets = get_local_ip_range()
    sweep_devices = await sweep_local_subnet(subnets, max_hosts=40)
    
    all_devices = list(onvif_devices)
    for d in sweep_devices:
        if d.ip not in discovered_ips:
            all_devices.append(d)
            discovered_ips.add(d.ip)
            
    return all_devices

def _test_rtsp_stream_cv2(url: str, timeout_sec: int = 3) -> tuple[bool, str, float]:
    """Tests if an RTSP URL can be decoded and delivers frames. Returns (success, resolution, fps)."""
    os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp|stimeout;2000000"
    try:
        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        ret, frame = cap.read()
        if ret and frame is not None and frame.size > 0:
            h, w = frame.shape[:2]
            fps = float(cap.get(cv2.CAP_PROP_FPS) or 25.0)
            cap.release()
            return True, f"{w}x{h}", fps
        cap.release()
        return False, "Unknown", 0.0
    except Exception:
        return False, "Unknown", 0.0

def _probe_onvif_soap_profiles(ip: str, onvif_port: int, username: str, password: str) -> List[ProfileInfo]:
    """
    Attempts to query ONVIF Media service via SOAP GetProfiles and GetStreamUri.
    Returns parsed ProfileInfo list if device supports ONVIF Media 1.0/2.0.
    """
    profiles: List[ProfileInfo] = []
    user_prefix = f"{username}:{password}@" if username else ""
    
    # Standard ONVIF Media SOAP Envelope for GetProfiles
    get_profiles_soap = """<?xml version="1.0" encoding="utf-8"?>
    <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
                   xmlns:trt="http://www.onvif.org/ver10/media/wsdl">
      <soap:Body>
        <trt:GetProfiles/>
      </soap:Body>
    </soap:Envelope>"""

    media_urls = [
        f"http://{ip}:{onvif_port}/onvif/Media",
        f"http://{ip}:{onvif_port}/onvif/media_service",
        f"http://{ip}:{onvif_port}/onvif/media",
        f"http://{ip}:{onvif_port}/onvif/device_service"
    ]

    for m_url in media_urls:
        try:
            auth = (username, password) if username else None
            headers = {"Content-Type": "application/soap+xml; charset=utf-8"}
            resp = requests.post(m_url, data=get_profiles_soap, headers=headers, auth=auth, timeout=2.5)
            if resp.status_code == 200 and ("GetProfilesResponse" in resp.text or "Profiles" in resp.text):
                # Parse profiles from XML
                root = ET.fromstring(resp.content)
                # Find all Profile nodes
                for elem in root.iter():
                    if elem.tag.endswith("Profiles"):
                        token = elem.attrib.get("token", "")
                        name_elem = elem.find(".//{*}Name")
                        name = name_elem.text if name_elem is not None and name_elem.text else f"Profile_{token}"
                        
                        # Resolution
                        w_elem = elem.find(".//{*}Width")
                        h_elem = elem.find(".//{*}Height")
                        w = w_elem.text if w_elem is not None else "1920"
                        h = h_elem.text if h_elem is not None else "1080"
                        res_str = f"{w}x{h}"

                        # Encoding
                        enc_elem = elem.find(".//{*}Encoding")
                        enc = enc_elem.text if enc_elem is not None else "H264"

                        # Try to get exact RTSP URI for this profile token
                        stream_uri_soap = f"""<?xml version="1.0" encoding="utf-8"?>
                        <soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"
                                       xmlns:trt="http://www.onvif.org/ver10/media/wsdl"
                                       xmlns:tt="http://www.onvif.org/ver10/schema">
                          <soap:Body>
                            <trt:GetStreamUri>
                              <trt:StreamSetup>
                                <tt:Stream>RTP-Unicast</tt:Stream>
                                <tt:Transport><tt:Protocol>RTSP</tt:Protocol></tt:Transport>
                              </trt:StreamSetup>
                              <trt:ProfileToken>{token}</trt:ProfileToken>
                            </trt:GetStreamUri>
                          </soap:Body>
                        </soap:Envelope>"""

                        rtsp_url = ""
                        try:
                            uri_resp = requests.post(m_url, data=stream_uri_soap, headers=headers, auth=auth, timeout=1.8)
                            if uri_resp.status_code == 200 and "Uri" in uri_resp.text:
                                uri_match = re.search(r'<[^:]*:Uri>([^<]+)</[^:]*:Uri>', uri_resp.text)
                                if uri_match:
                                    raw_uri = uri_match.group(1)
                                    # Insert credentials if missing
                                    if user_prefix and "@" not in raw_uri:
                                        rtsp_url = raw_uri.replace("rtsp://", f"rtsp://{user_prefix}")
                                    else:
                                        rtsp_url = raw_uri
                        except Exception:
                            pass

                        if not rtsp_url:
                            rtsp_url = f"rtsp://{user_prefix}{ip}:554/{token}"

                        is_high_res = int(w) >= 1280
                        rec_for = "main" if is_high_res else "sub"
                        desc = "Recommended for Recording & 4K Snapshots" if is_high_res else "Recommended for Fast Real-Time AI Detection"

                        profiles.append(ProfileInfo(
                            name=f"{name} ({res_str})",
                            token=token,
                            resolution=res_str,
                            encoding=enc,
                            rtsp_url=rtsp_url,
                            recommended_for=rec_for,
                            description=desc
                        ))
                if profiles:
                    return profiles
        except Exception:
            continue

    return profiles

async def verify_camera_credentials(
    ip: str,
    onvif_port: int,
    rtsp_port: int,
    username: str,
    password: str
) -> CredentialVerifyResponse:
    """
    Tests credentials against the camera and probes all available stream profiles.
    Returns verified status, detected vendor/model, and a selectable list of stream profiles.
    """
    user_prefix = f"{username}:{password}@" if username else ""

    # 1. Try authentic ONVIF Media SOAP discovery if ONVIF port is open
    is_onvif_open = await scan_host_port(ip, onvif_port, timeout=0.3)
    if is_onvif_open:
        onvif_profiles = await asyncio.to_thread(_probe_onvif_soap_profiles, ip, onvif_port, username, password)
        if onvif_profiles:
            main_prof = next((p for p in onvif_profiles if p.recommended_for == "main"), onvif_profiles[0])
            sub_prof = next((p for p in onvif_profiles if p.recommended_for == "sub"), onvif_profiles[-1])

            return CredentialVerifyResponse(
                success=True,
                message=f"Discovered {len(onvif_profiles)} authentic ONVIF media stream profiles directly from camera!",
                vendor="ONVIF Compliant",
                model="Network IP Camera",
                profiles=onvif_profiles,
                suggested_main_url=main_prof.rtsp_url,
                suggested_sub_url=sub_prof.rtsp_url
            )

    # 2. Multi-Vendor Candidate Stream Definitions
    vendor_stream_sets = [
        # XM / Xiongmai / Netcat / Annke / Generic Chinese IP Cameras
        {
            "vendor": "XM / Xiongmai / Annke",
            "probe_url": f"rtsp://{user_prefix}{ip}:{rtsp_port}/11",
            "streams": [
                ProfileInfo(
                    name="Channel 1 (Main Stream /11)",
                    token="xm_11",
                    resolution="1920x1080 (HD / 4K)",
                    encoding="H.264 / H.265",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/11",
                    recommended_for="main",
                    description="Primary high-definition stream. Recommended for Recording & Snapshots."
                ),
                ProfileInfo(
                    name="Channel 1 (Sub Stream Fast AI /12)",
                    token="xm_12",
                    resolution="640x360 (Fast AI)",
                    encoding="H.264",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/12",
                    recommended_for="sub",
                    description="Low-latency secondary stream. Recommended for Real-Time AI Inference."
                ),
                ProfileInfo(
                    name="Channel 1 (Alternative Main /1)",
                    token="xm_1",
                    resolution="1920x1080 (HD)",
                    encoding="H.264",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/1",
                    recommended_for="main",
                    description="Alternative direct channel 1 stream."
                ),
                ProfileInfo(
                    name="Channel 1 (Alternative Sub /2)",
                    token="xm_2",
                    resolution="640x360 (Fast)",
                    encoding="H.264",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/2",
                    recommended_for="sub",
                    description="Alternative direct channel 2 sub stream."
                )
            ]
        },
        # Hikvision
        {
            "vendor": "Hikvision",
            "probe_url": f"rtsp://{user_prefix}{ip}:{rtsp_port}/Streaming/Channels/101",
            "streams": [
                ProfileInfo(
                    name="Hikvision Channel 1 (Main Stream 1080p/4K)",
                    token="hik_101",
                    resolution="1920x1080 (HD / 4K)",
                    encoding="H.264 / H.265",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/Streaming/Channels/101",
                    recommended_for="main",
                    description="Primary high-definition stream. Recommended for Recording & Snapshots."
                ),
                ProfileInfo(
                    name="Hikvision Channel 1 (Sub Stream Fast AI)",
                    token="hik_102",
                    resolution="640x360 (Fast AI)",
                    encoding="H.264",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/Streaming/Channels/102",
                    recommended_for="sub",
                    description="Low-latency secondary stream. Recommended for Real-Time AI Inference."
                ),
                ProfileInfo(
                    name="Hikvision Channel 1 (Third Stream Balanced)",
                    token="hik_103",
                    resolution="1280x720 (Balanced)",
                    encoding="H.264",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/Streaming/Channels/103",
                    recommended_for="both",
                    description="Medium resolution stream for mobile bandwidth saving."
                )
            ]
        },
        # Dahua / Amcrest
        {
            "vendor": "Dahua / Amcrest",
            "probe_url": f"rtsp://{user_prefix}{ip}:{rtsp_port}/cam/realmonitor?channel=1&subtype=0",
            "streams": [
                ProfileInfo(
                    name="Dahua Main Stream (subtype 0)",
                    token="dahua_sub0",
                    resolution="1920x1080 (HD / 4K)",
                    encoding="H.264 / H.265",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/cam/realmonitor?channel=1&subtype=0",
                    recommended_for="main",
                    description="High-definition main video stream."
                ),
                ProfileInfo(
                    name="Dahua Sub Stream (subtype 1)",
                    token="dahua_sub1",
                    resolution="640x360 (Fast AI)",
                    encoding="H.264",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/cam/realmonitor?channel=1&subtype=1",
                    recommended_for="sub",
                    description="Low-latency sub stream for fast computer vision processing."
                )
            ]
        },
        # Reolink
        {
            "vendor": "Reolink",
            "probe_url": f"rtsp://{user_prefix}{ip}:{rtsp_port}/h264Preview_01_main",
            "streams": [
                ProfileInfo(
                    name="Reolink Clear Main Stream",
                    token="reo_main",
                    resolution="2560x1440 (2K / 4K)",
                    encoding="H.264 / H.265",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/h264Preview_01_main",
                    recommended_for="main",
                    description="Full clarity stream for crystal-clear archive recording."
                ),
                ProfileInfo(
                    name="Reolink Fluent Sub Stream",
                    token="reo_sub",
                    resolution="640x360 (Fluent Fast AI)",
                    encoding="H.264",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/h264Preview_01_sub",
                    recommended_for="sub",
                    description="Fluent stream for low-latency live matrix and AI inference."
                )
            ]
        },
        # TP-Link Tapo
        {
            "vendor": "TP-Link Tapo",
            "probe_url": f"rtsp://{user_prefix}{ip}:{rtsp_port}/stream1",
            "streams": [
                ProfileInfo(
                    name="Tapo Stream 1 (High Quality)",
                    token="tapo_1",
                    resolution="1920x1080 (HQ)",
                    encoding="H.264",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/stream1",
                    recommended_for="main",
                    description="Full quality Tapo stream for recording."
                ),
                ProfileInfo(
                    name="Tapo Stream 2 (Sub Low-Latency)",
                    token="tapo_2",
                    resolution="640x360 (Low Latency)",
                    encoding="H.264",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/stream2",
                    recommended_for="sub",
                    description="Low bandwidth Tapo stream for real-time AI scanning."
                )
            ]
        },
        # Generic ONVIF / RTSP
        {
            "vendor": "Generic RTSP",
            "probe_url": f"rtsp://{user_prefix}{ip}:{rtsp_port}/live/ch0",
            "streams": [
                ProfileInfo(
                    name="Generic Channel 0 (Main HD)",
                    token="gen_ch0",
                    resolution="1920x1080 (HD)",
                    encoding="H.264",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/live/ch0",
                    recommended_for="main",
                    description="Standard RTSP channel 0 full resolution."
                ),
                ProfileInfo(
                    name="Generic Channel 1 (Sub Fast)",
                    token="gen_ch1",
                    resolution="640x360 (Fast AI)",
                    encoding="H.264",
                    rtsp_url=f"rtsp://{user_prefix}{ip}:{rtsp_port}/live/ch1",
                    recommended_for="sub",
                    description="Standard RTSP channel 1 sub resolution."
                )
            ]
        }
    ]

    # Fast Concurrent Probe of All Candidate Vendor Streams
    is_rtsp_open = await scan_host_port(ip, rtsp_port, timeout=0.35)
    if not is_rtsp_open and not is_onvif_open:
        return CredentialVerifyResponse(
            success=False,
            message=f"Camera host {ip} is unreachable on RTSP port {rtsp_port} or ONVIF port {onvif_port}. Check network connection and IP address.",
            vendor="Unreachable",
            model="Network IP Camera",
            profiles=[],
            suggested_main_url="",
            suggested_sub_url=""
        )

    if is_rtsp_open:
        def _test_candidate(cand):
            is_ok, res_str, fps = _test_rtsp_stream_cv2(cand["probe_url"], timeout_sec=2)
            return cand, is_ok, res_str, fps

        def _run_parallel_probes():
            with concurrent.futures.ThreadPoolExecutor(max_workers=len(vendor_stream_sets)) as executor:
                return list(executor.map(_test_candidate, vendor_stream_sets))

        probe_results = await asyncio.to_thread(_run_parallel_probes)

        verified_profiles: List[ProfileInfo] = []
        verified_vendors: List[str] = []

        for candidate, is_ok, res_str, fps in probe_results:
            if is_ok:
                verified_vendors.append(candidate["vendor"])
                streams = candidate["streams"]
                # Update first stream resolution with actual probed resolution
                streams[0].resolution = res_str
                streams[0].fps = int(fps)

                # Also test sub-stream for accurate sub-resolution
                if len(streams) > 1:
                    sub_ok, sub_res, sub_fps = _test_rtsp_stream_cv2(streams[1].rtsp_url, timeout_sec=2)
                    if sub_ok:
                        streams[1].resolution = sub_res
                        streams[1].fps = int(sub_fps)

                verified_profiles.extend(streams)

        if verified_profiles:
            main_cand = next((p for p in verified_profiles if p.recommended_for == "main"), verified_profiles[0])
            sub_cand = next((p for p in verified_profiles if p.recommended_for == "sub"), verified_profiles[-1])
            vendor_title = " / ".join(verified_vendors[:2])

            return CredentialVerifyResponse(
                success=True,
                message=f"Verified connection! Discovered {len(verified_profiles)} active stream profiles ({vendor_title}).",
                vendor=vendor_title,
                model="Network IP Camera",
                profiles=verified_profiles,
                suggested_main_url=main_cand.rtsp_url,
                suggested_sub_url=sub_cand.rtsp_url
            )

    # If reached here: NONE of the candidate streams delivered video frames!
    # Explicitly check if camera returned 401 Unauthorized
    auth_rejected = False
    try:
        s = socket.socket()
        s.settimeout(1.2)
        s.connect((ip, rtsp_port))
        s.send(f"DESCRIBE rtsp://{ip}:{rtsp_port}/11 RTSP/1.0\r\nCSeq: 1\r\n\r\n".encode())
        res_raw = s.recv(1024).decode(errors='ignore')
        s.close()
        if "401 Unauthorized" in res_raw:
            auth_rejected = True
    except Exception:
        pass

    if auth_rejected:
        return CredentialVerifyResponse(
            success=False,
            message="Authentication failed (401 Unauthorized): Camera rejected the credentials. Please verify your username and password.",
            vendor="Authentication Required",
            model="Network IP Camera",
            profiles=[],
            suggested_main_url="",
            suggested_sub_url=""
        )

    return CredentialVerifyResponse(
        success=False,
        message="Authentication / Stream verification failed: Unable to decode video frames with the provided credentials. Please check username, password, and RTSP stream path.",
        vendor="Unverified",
        model="Network IP Camera",
        profiles=[],
        suggested_main_url="",
        suggested_sub_url=""
    )
