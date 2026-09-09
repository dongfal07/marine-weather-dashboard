import json
import os

# 지방청 코드 매핑 (NMPNT 항로표지)
MMAF_MAP = {
    "101": "부산청",
    "102": "인천청",
    "103": "여수청",
    "104": "울산청",
    "105": "대산청",
    "106": "평택청",
    "107": "목포청",
    "108": "군산청",
    "109": "마산청",
    "110": "포항청",
    "111": "동해청",
    "112": "제주단",
    "113": "진도소",
}

# 기상청(KMA) 공식 해양기상부이 17개소 (파고 특화 관측망)
KMA_BUOYS = [
    {"stnId": "22101", "name": "덕적도부이", "area": "서해중부", "lat": 37.2333, "lng": 126.0167},
    {"stnId": "22102", "name": "칠발도부이", "area": "서해남부", "lat": 34.7833, "lng": 125.7667},
    {"stnId": "22103", "name": "거문도부이", "area": "남해서부", "lat": 34.0000, "lng": 127.3000},
    {"stnId": "22104", "name": "거제도부이", "area": "남해동부", "lat": 34.7667, "lng": 128.9000},
    {"stnId": "22105", "name": "동해부이", "area": "동해중부", "lat": 37.5333, "lng": 130.0000},
    {"stnId": "22106", "name": "포항부이", "area": "동해남부", "lat": 36.2167, "lng": 129.7833},
    {"stnId": "22107", "name": "마라도부이", "area": "제주남부", "lat": 33.0833, "lng": 126.2667},
    {"stnId": "22108", "name": "외연도부이", "area": "서해중부", "lat": 36.2500, "lng": 125.7500},
    {"stnId": "21229", "name": "울릉도부이", "area": "동해중부", "lat": 37.4500, "lng": 131.1167},
    {"stnId": "22183", "name": "서해206부이", "area": "서해먼바다", "lat": 36.0000, "lng": 124.9500},
    {"stnId": "22184", "name": "서해170부이", "area": "서해외해", "lat": 36.6500, "lng": 124.0500},
    {"stnId": "22185", "name": "신안부이", "area": "서해남부", "lat": 35.0333, "lng": 125.9833},
    {"stnId": "22186", "name": "추자도부이", "area": "남해서부", "lat": 33.9167, "lng": 126.2333},
    {"stnId": "22187", "name": "인천부이", "area": "서해중부", "lat": 37.3833, "lng": 126.5333},
    {"stnId": "22188", "name": "부안부이", "area": "서해남부", "lat": 35.7333, "lng": 126.3333},
    {"stnId": "22189", "name": "통영부이", "area": "남해동부", "lat": 34.6167, "lng": 128.3833},
    {"stnId": "22190", "name": "울산부이", "area": "동해남부", "lat": 35.3667, "lng": 129.4500},
]

# 국립해양조사원(KHOA) 핵심 조위/해양관측소 (조석/수온/파고)
KHOA_STATIONS = [
    {"obsCode": "DT_0001", "name": "인천조위관측소", "area": "인천", "lat": 37.4519, "lng": 126.5925, "type": "조위관측소"},
    {"obsCode": "DT_0004", "name": "부산조위관측소", "area": "부산", "lat": 35.0964, "lng": 129.0361, "type": "조위관측소"},
    {"obsCode": "DT_0007", "name": "제주조위관측소", "area": "제주", "lat": 33.5275, "lng": 126.5431, "type": "조위관측소"},
    {"obsCode": "DT_0013", "name": "여수조위관측소", "area": "여수", "lat": 34.7472, "lng": 127.7667, "type": "조위관측소"},
    {"obsCode": "DT_0023", "name": "속초조위관측소", "area": "강원", "lat": 38.2072, "lng": 128.5942, "type": "조위관측소"},
    {"obsCode": "TW_0062", "name": "해운대해양부이", "area": "부산", "lat": 35.1539, "lng": 129.1689, "type": "해양관측부이"},
    {"obsCode": "TW_0090", "name": "대천해양부이", "area": "충남", "lat": 36.3150, "lng": 126.4950, "type": "해양관측부이"}
]

def clean_stations():
    with open('realtimeInfo_selectRealtimeList.json', 'r', encoding='utf-8') as f:
        data = json.load(f)

    raw_list = data.get('realtimeList', [])
    cleaned = []

    # 1. NMPNT 항로표지 (기상신호표지)
    for item in raw_list:
        mmaf = str(item.get('mmafCode', ''))
        mmsi = str(item.get('mmsi', '')).strip()
        station_nm = str(item.get('stationNm', '')).strip()
        lat = item.get('latitude')
        lng = item.get('longitude')

        if not mmsi or lat is None or lng is None:
            continue

        try:
            lat = float(lat)
            lng = float(lng)
        except (ValueError, TypeError):
            continue

        # 한국 연안 좌표 필터 (위도 31~39, 경도 124~132)
        if not (31.0 <= lat <= 39.0 and 124.0 <= lng <= 132.0):
            continue

        cleaned.append({
            "provider": "NMPNT",
            "providerNm": "항로표지",
            "stationType": item.get('stationType1', '등표/등대'),
            "mmafCode": mmaf,
            "mmafNm": MMAF_MAP.get(mmaf, f"청({mmaf})"),
            "mmsi": mmsi,
            "stationNm": station_nm,
            "latitude": lat,
            "longitude": lng,
            "sensors": {
                "wind": item.get('windSpeedInst') == '1',
                "airTemp": item.get('airTemperInst') == '1',
                "waterTemp": item.get('waterTemperInst') == '1',
                "wave": False, # 현재 NMPNT 관측소 센서 미제공
                "pressure": item.get('airPressureInst') == '1',
                "humidity": item.get('humidityInst') == '1',
                "current": item.get('current1Inst') == '1',
                "visibility": item.get('horizonVisiblInst') == '1'
            }
        })

    # 2. KMA 기상청 해양기상부이 (파고 전문)
    for b in KMA_BUOYS:
        cleaned.append({
            "provider": "KMA",
            "providerNm": "기상청",
            "stationType": "해양기상부이",
            "mmafCode": "KMA",
            "mmafNm": f"기상청({b['area']})",
            "mmsi": b["stnId"],
            "stationNm": b["name"],
            "latitude": b["lat"],
            "longitude": b["lng"],
            "sensors": {
                "wind": True,
                "airTemp": True,
                "waterTemp": True,
                "wave": True,     # 유의파고, 최대파고, 파주기 지원!
                "pressure": True,
                "humidity": True,
                "current": False,
                "visibility": False
            }
        })

    # 3. KHOA 국립해양조사원 바다누리 관측망
    for k in KHOA_STATIONS:
        is_buoy = "부이" in k["type"]
        cleaned.append({
            "provider": "KHOA",
            "providerNm": "해양조사원",
            "stationType": k["type"],
            "mmafCode": "KHOA",
            "mmafNm": f"조사원({k['area']})",
            "mmsi": k["obsCode"],
            "stationNm": k["name"],
            "latitude": k["lat"],
            "longitude": k["lng"],
            "sensors": {
                "wind": True,
                "airTemp": True,
                "waterTemp": True,
                "wave": is_buoy, # 해양관측부이는 파고 지원
                "pressure": True,
                "humidity": False,
                "current": False,
                "visibility": False
            }
        })

    # 정렬: Provider 우선 (KMA 부이 -> KHOA -> NMPNT 항로표지), 그 다음 이름순
    provider_order = {"KMA": 0, "KHOA": 1, "NMPNT": 2}
    cleaned.sort(key=lambda x: (provider_order.get(x['provider'], 9), x['mmafCode'], x['stationNm']))

    os.makedirs('public', exist_ok=True)
    with open('public/stations.json', 'w', encoding='utf-8') as f:
        json.dump(cleaned, f, ensure_ascii=False, indent=2)

    kma_count = sum(1 for s in cleaned if s['provider'] == 'KMA')
    khoa_count = sum(1 for s in cleaned if s['provider'] == 'KHOA')
    nmpnt_count = sum(1 for s in cleaned if s['provider'] == 'NMPNT')
    wave_count = sum(1 for s in cleaned if s['sensors']['wave'])

    print(f"Total stations saved: {len(cleaned)}")
    print(f" - KMA Buoys: {kma_count}")
    print(f" - KHOA Stations: {khoa_count}")
    print(f" - NMPNT Stations: {nmpnt_count}")
    print(f" - Stations with Wave Sensor (wave: true): {wave_count}")

if __name__ == '__main__':
    clean_stations()
