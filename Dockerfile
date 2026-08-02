FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application (v2 - force rebuild)
COPY app/ app/
COPY static/ static/
# Nunca copiar .env: en prod las variables las inyecta la plataforma (Railway/etc);
# copiar archivos .env locales hornearía secretos en las capas de la imagen.

# Run
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
