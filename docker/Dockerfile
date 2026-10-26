# Backend image for local development and tests. The frontend is NOT included; run it separately
# (cd frontend && npm run dev). Kept under docker/ on purpose: Railway switches from Procfile/Nixpacks
# to a Docker build if it finds a Dockerfile at the repo root, which would change the deploy.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
