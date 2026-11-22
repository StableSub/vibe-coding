# 망한 발명품 경매장

한 방에서 최대 세 사람이 100콩씩 들고 세 작품에 입찰합니다. 혼자 시작하면 자동 입찰자 두 명이 참가합니다.

## 로컬 실행

Python 3.10 이상과 PATH에서 실행 가능한 Node.js 22.13 이상이 필요합니다. Python 3.10.0, Flask 3.1.3, Node.js 24.14.0에서 확인했습니다. Windows PowerShell에서 프로젝트 폴더를 열고 실행합니다.

```powershell
py -3.10 -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements.txt
.\.venv\Scripts\python app.py
```

브라우저에서 [로컬 경매장](http://127.0.0.1:5050/)을 엽니다. 다른 참가자 역할은 별도의 브라우저 프로필에서 확인할 수 있습니다. macOS와 Linux에서는 `python3 -m venv .venv`로 환경을 만든 뒤 `.venv/bin/python`을 사용합니다.

## 구조와 검증

Flask가 Jinja로 첫 화면을 렌더링하고 API 요청을 전용 Node 프로세스에 전달합니다. 이 프로세스와 배포용 Worker가 `server/api.js`와 `server/game.js`를 공유하므로 마감, 정산, 투표 규칙을 함께 사용합니다. 로컬 방과 참가자 기록은 `.data/rooms.sqlite`에 저장됩니다. `AUCTION_DATA_DIR`로 경로를 바꿀 수 있습니다. Worker는 Sites에서 제공하는 `DB` D1 바인딩을 사용합니다.

```sh
node --test test/auction.test.js
node scripts/build.mjs
```

빌드 명령은 화면 파일을 포함한 Worker를 `dist/server/index.js`에 생성합니다. Node 패키지 설치 없이 실행할 수 있습니다.

실행 중인 Flask 서버에 두 명이 입장해 정산·검색·투표까지 확인하려면 별도 PowerShell에서 아래 테스트를 실행합니다. 테스트용 경매장 한 곳이 로컬 DB에 추가됩니다.

```powershell
$env:AUCTION_TEST_ORIGIN = "http://127.0.0.1:5050"
node --test test/auction.test.js
```
