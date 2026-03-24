FROM node:20-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends autoconf automake build-essential cmake ca-certificates libtool pkg-config tesseract-ocr tesseract-ocr-eng \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /var/task

COPY package.json package-lock.json* ./
RUN npm install --omit=dev \
  && npm cache clean --force

COPY handler.js ./

ENTRYPOINT ["/usr/local/bin/npx", "aws-lambda-ric"]
CMD ["handler.handler"]
