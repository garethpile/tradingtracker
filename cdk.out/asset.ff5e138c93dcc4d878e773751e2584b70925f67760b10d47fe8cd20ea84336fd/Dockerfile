FROM public.ecr.aws/lambda/nodejs:20

RUN apt-get update \
  && apt-get install -y --no-install-recommends autoconf automake build-essential cmake ca-certificates libtool pkg-config python3 tesseract-ocr tesseract-ocr-eng \
  && rm -rf /var/lib/apt/lists/*

WORKDIR ${LAMBDA_TASK_ROOT}

COPY package.json package-lock.json* ./
RUN npm install --omit=dev \
  && npm cache clean --force

COPY handler.js ./

CMD ["handler.handler"]
