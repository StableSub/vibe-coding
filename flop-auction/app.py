"""Flask entrypoint. The subprocess shares its auction rules with the hosted Worker."""
import atexit
import json
import os
from pathlib import Path
import subprocess
import threading

from flask import Flask, Response, jsonify, render_template, request, send_from_directory

ROOT = Path(__file__).resolve().parent
PUBLIC = ROOT / "public"
DATA = Path(os.environ.get("AUCTION_DATA_DIR", ROOT / ".data"))
app = Flask(__name__, static_folder=None, template_folder=str(PUBLIC))
app.config["MAX_CONTENT_LENGTH"] = 74_000
app.config["TEMPLATES_AUTO_RELOAD"] = True
engine = None
engine_lock = threading.Lock()


def close_engine():
    global engine
    if engine and engine.poll() is None:
        engine.stdin.close()
        try:
            engine.wait(timeout=3)
        except subprocess.TimeoutExpired:
            engine.terminate()
    engine = None


atexit.register(close_engine)


def exchange(payload):
    global engine
    with engine_lock:
        if engine is None or engine.poll() is not None:
            DATA.mkdir(parents=True, exist_ok=True)
            engine = subprocess.Popen(
                ["node", str(ROOT / "server" / "bridge.js"), str(DATA / "rooms.sqlite")],
                cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                encoding="utf-8", bufsize=1,
            )
        engine.stdin.write(json.dumps(payload, ensure_ascii=False) + "\n")
        engine.stdin.flush()
        return json.loads(engine.stdout.readline())


@app.route("/api/<path:action>", methods=["GET", "POST"])
def api(action):
    try:
        result = exchange({
            "url": request.full_path, "method": request.method,
            "body": request.get_data(as_text=True),
            "authorization": request.headers.get("Authorization"),
        })
    except (OSError, ValueError):
        app.logger.exception("Local auction engine unavailable")
        return jsonify(error={"code": "SERVICE", "message": "경매 엔진을 다시 연결해 주세요."}), 503
    return Response(result["body"], status=result["status"], content_type="application/json; charset=utf-8",
                    headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"})


@app.errorhandler(413)
def too_large(_error):
    return jsonify(error={"code": "TOO_LARGE", "message": "사진을 조금 더 압축해 주세요."}), 413


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/<path:filename>")
def asset(filename):
    return send_from_directory(PUBLIC, filename)


if __name__ == "__main__":
    app.run(host=os.environ.get("HOST", "127.0.0.1"), port=int(os.environ.get("PORT", "5050")), threaded=True)
