ARG BUILD_FROM=ghcr.io/homeassistant/amd64-base-python:latest
FROM ${BUILD_FROM}

# Instalace Python závislostí
RUN pip install --no-cache-dir \
    requests \
    aiohttp

# Kopírování aplikace
COPY run.py /app/
COPY web/ /app/web/

# Nastavení oprávnění
RUN chmod +x /app/run.py

# Spuštění aplikace
CMD [ "python3", "/app/run.py" ]
