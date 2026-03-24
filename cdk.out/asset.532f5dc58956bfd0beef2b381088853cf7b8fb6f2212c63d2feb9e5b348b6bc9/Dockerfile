FROM public.ecr.aws/lambda/nodejs:20

RUN dnf install -y tesseract tesseract-langpack-eng \
  && dnf clean all

WORKDIR ${LAMBDA_TASK_ROOT}

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY handler.js ./

CMD ["handler.handler"]
