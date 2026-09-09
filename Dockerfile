FROM python:3.11-slim

WORKDIR /app

# Copy application files
COPY . .

# Cloud platforms pass dynamic port via PORT environment variable
ENV PORT=8080
EXPOSE 8080

CMD ["python", "server.py"]
