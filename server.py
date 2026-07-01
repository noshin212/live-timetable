from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import json
import os
import string
import random

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