FROM python:3.11-slim

WORKDIR /app

# Copy all files
COPY . .

# Expose port 8000
EXPOSE 8000

# Run Python HTTP server
CMD ["python3", "-m", "http.server", "8000"]
