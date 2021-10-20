#!/usr/bin/env python3

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# Allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

# Serve the API
routes = ['perform', 'attend', 'pod', 'login']
for r in routes:
    module = __import__('theater.' + r, fromlist=['router'])
    app.include_router(module.router)

# Serve the static files
app.mount('/', StaticFiles(directory='www', html=True))

if __name__ == "__main__":
    uvicorn.run('theater.main:app', host='0.0.0.0', port=80, reload=True)
