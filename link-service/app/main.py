#!/usr/bin/env python3

import uvicorn
from os import getenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Allow cross-origin requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

app.mount("/style", StaticFiles(directory="graffiti/style"), name="style")

# Serve the API
routes = ['auth.auth', 'db.db']
for r in routes:
    module = __import__('graffiti.' + r, fromlist=['router'])
    app.include_router(module.router)

if __name__ == "__main__":
    if getenv('DEBUG') == 'true':
        args = {'port': 5000, 'reload': True}
    else:
        args = {'port': 5000, 'proxy_headers': True}
    uvicorn.run('graffiti.main:app', host='0.0.0.0', **args)
