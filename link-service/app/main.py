#!/usr/bin/env python3

import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

app = FastAPI()

routes = ['perform', 'attend', 'pod', 'login']
for r in routes:
    module = __import__('theater.' + r, fromlist=['router'])
    app.include_router(module.router)

app.mount('/', StaticFiles(directory='www', html=True))

if __name__ == "__main__":
    uvicorn.run('theater.main:app', host='0.0.0.0', port=80, reload=True)
