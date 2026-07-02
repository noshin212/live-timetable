from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
import string
import random
from typing import Dict, List

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_FILE = "timetable.json"

def load_db():
    if not os.path.exists(DATA_FILE):
        return {}
    with open(DATA_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def save_db(db):
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump(db, f, indent=2, ensure_ascii=False)

def generate_short_id():
    return ''.join(random.choices(string.ascii_letters + string.digits, k=6))

class TimeTableData(BaseModel):
    data: dict

# ==========================================
# WebSocketの接続を管理するクラス
# ==========================================
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id:str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)
    
    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            self.active_connections[room_id].remove(websocket)
            
            if not self.active_connections[room_id]:
                del self.active_connections[room_id]

    async def broadcast(self, message: bytes, room_id: str, sender: WebSocket):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                if connection != sender:
                    await connection.send_bytes(message)
    
manager = ConnectionManager()

@app.get("/")
def read_root():
    return FileResponse("index.html")

@app.post("/save")
def save_timetable(tt: TimeTableData):
    db = load_db()
    short_id = generate_short_id()
    db[short_id] = tt.data
    save_db(db)
    return {"id": short_id}
 

@app.get("/load/{short_id}")
def get_timetable(short_id: str):
    db = load_db()
    if short_id in db:
        return {"success": True, "data": db[short_id]}
    return {"success": False, "error": "Not found"}

# ==========================================
# WebSocketのエンドポイント
# ==========================================

@app.websocket("/ws/{short_id}")
async def websocket_endpoint(websocket: WebSocket, short_id: str):
    await manager.connect(websocket, short_id)
    try:
        while True:
            data = await websocket.receive_bytes()
            await manager.broadcast(data, short_id, websocket)
    
    except WebSocketDisconnect:
        manager.disconnect(websocket, short_id)