import { createWorker } from 'tesseract.js';

export type ScreenshotExtractionResult = {
  extractedText: string;
  extractedSummary: string;
  expertOpinion: string;
};

const summarizeScreenshotText = (text: string): string => {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const picked = lines.filter((line) => {
    const lower = line.toLowerCase();
    return /entry|sl|stop|tp|target|rr|risk|session|bias|result|setup|confluence|bos|choch|fvg|liquidity/.test(lower);
  });

  return (picked.length > 0 ? picked : lines).slice(0, 12).join('\n');
};

const buildExpertOpinion = (text: string): string => {
  const lower = text.toLowerCase();
  const points: string[] = [];

  if (/(break of structure|bos|choch|change of character)/i.test(lower)) {
    points.push('Market structure language suggests the setup is being framed around a shift in trend or continuation logic.');
  }
  if (/(liquidity|sweep|equal highs|equal lows)/i.test(lower)) {
    points.push('There appears to be an emphasis on liquidity interaction, which usually matters most if entry timing is aligned with confirmation.');
  }
  if (/(entry|stop|sl|tp|target)/i.test(lower)) {
    points.push('The screenshot includes explicit execution planning details, so risk-to-reward and invalidation can be reviewed consistently after the trade.');
  }
  if (/(fvg|fair value gap|order block|ob|demand|supply)/i.test(lower)) {
    points.push('The setup references zone-based confluence, so the quality of the trade will depend on how cleanly price reacts at the intended area.');
  }

  if (points.length === 0) {
    points.push('The screenshot contains enough structured annotation to log the setup, but the quality of the trade still depends on whether entry, invalidation, and target logic are all clearly aligned.');
    points.push('Use the extracted notes as a journal aid, then sanity-check whether the setup had a clear reason to exist before execution.');
  }

  return points.slice(0, 4).join(' ');
};

export const extractFromScreenshot = async (dataUrl: string): Promise<ScreenshotExtractionResult> => {
  const worker = await createWorker('eng');
  try {
    const result = await worker.recognize(dataUrl);
    const extractedText = result.data.text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n');

    return {
      extractedText,
      extractedSummary: summarizeScreenshotText(extractedText),
      expertOpinion: buildExpertOpinion(extractedText)
    };
  } finally {
    await worker.terminate();
  }
};
