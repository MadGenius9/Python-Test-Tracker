import { DeliveryTicket, ProductCodeMapping, TicketConfidence, TicketParserType } from '../types';

export interface ParsedTicketScan {
  rawValue: string;
  ticketNumber?: string;
  weightLbs?: number;
  lbs?: number | null; // backward compatibility
  productCode?: string | null;
  supplier?: string | null;
  carrier?: string | null;
  truck?: string | null;
  poNumber?: string | null;
  matchedSandType?: string | null;
  confidence: TicketConfidence;
  parser: TicketParserType;
  isSixPartAtlas: boolean;
  score?: number;
  format?: string;
  warning?: string;
}

/**
 * Normalizes ticket numbers across the entire application:
 * Trims whitespace, capitalizes letters, and removes internal whitespace.
 *
 * Example:
 * "m 30134835" -> "M30134835"
 * "M30134835" -> "M30134835"
 * " 762883 " -> "762883"
 */
export function normalizeTicketNumber(value: string): string {
  if (!value) return '';
  return value
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

/**
 * Validates ticket fields and plausibility.
 */
export interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  errors: string[];
}

export function validateTicketFields(fields: {
  ticketNumber?: string;
  weightLbs?: number;
}): ValidationResult {
  const warnings: string[] = [];
  const errors: string[] = [];

  const normTicket = normalizeTicketNumber(fields.ticketNumber || '');
  if (!normTicket) {
    errors.push('Ticket number is required.');
  } else if (normTicket.length < 2) {
    errors.push('Ticket number is too short (minimum 2 characters).');
  } else if (normTicket.length > 35) {
    errors.push('Ticket number is unusually long.');
  } else if (/^(PO|ORDER|BOL|REF|INV)[:#\-_]?\d*$/i.test(normTicket)) {
    warnings.push(`"${normTicket}" looks like a purchase order or reference prefix, not a unique ticket number.`);
  }

  if (fields.weightLbs !== undefined && fields.weightLbs !== null && !isNaN(fields.weightLbs)) {
    if (fields.weightLbs <= 0) {
      errors.push('Weight must be greater than 0 lbs.');
    } else if (fields.weightLbs < 10000 || fields.weightLbs > 100000) {
      warnings.push(
        `Scanned weight ${fields.weightLbs.toLocaleString()} lbs is outside standard truckload range (10,000 – 100,000 lbs).`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Scores a parsed ticket candidate for multi-code resolution.
 */
export function scoreCandidate(parsed: ParsedTicketScan): number {
  let score = 0;

  if (parsed.parser === 'atlas') score += 100;
  else if (parsed.parser === 'atlas-partial') score += 90;
  else if (parsed.parser === 'known_supplier') score += 80;
  else if (parsed.parser === 'generic_labeled') score += 70;

  if (parsed.confidence === 'confirmed') score += 50;
  else if (parsed.confidence === 'probable') score += 20;

  if (parsed.ticketNumber) {
    score += 25;
    // Extra points for plausible ticket number format (e.g. 5-15 alphanumeric)
    if (parsed.ticketNumber.length >= 4 && parsed.ticketNumber.length <= 20) {
      score += 10;
    }
  }

  if (parsed.weightLbs && parsed.weightLbs >= 10000 && parsed.weightLbs <= 100000) {
    score += 15;
  }
  if (parsed.productCode || parsed.matchedSandType) {
    score += 10;
  }
  if (parsed.carrier || parsed.supplier) {
    score += 5;
  }
  if (parsed.truck) {
    score += 5;
  }
  if (parsed.poNumber) {
    score += 5;
  }

  return score;
}

/**
 * Parses raw barcode/QR scan string.
 *
 * Strict Atlas pipe-delimited format:
 *   M30134835 | 07 | ODOVA Trucking | C10450-9307 | 100M | 52380
 *   [0] Ticket number
 *   [1] Truck number
 *   [2] Carrier
 *   [3] PO number
 *   [4] Product code (mine sand code)
 *   [5] Net pounds
 *
 * Generic labeled format:
 *   Ticket: 762883
 *   PO: 1098347265987
 *   Weight: 51220
 *   Product: 100 Mesh
 */
export function parseTicketScanValue(
  rawValue: string,
  mappings: ProductCodeMapping[] = []
): ParsedTicketScan {
  const trimmed = (rawValue || '').trim();
  if (!trimmed) {
    return {
      rawValue: '',
      isSixPartAtlas: false,
      ticketNumber: undefined,
      confidence: 'unknown',
      parser: 'unknown',
    };
  }

  // 1. Pipe-delimited Atlas format (handles full 6-part, partial, trailing pipe, etc.)
  if (trimmed.includes('|')) {
    const pipeParts = trimmed.split('|').map((p) => p.trim());
    const rawTicket = pipeParts[0] || '';

    // Check if pipeParts[0] is non-empty and passes the existing isTicketValid check
    const isTicketValid =
      rawTicket.length >= 2 &&
      rawTicket.length <= 40 &&
      !/^(ticket|tkt|ticket#|bol)$/i.test(rawTicket);

    if (isTicketValid) {
      const truck = pipeParts[1] ? pipeParts[1] : undefined;
      const carrier = pipeParts[2] ? pipeParts[2] : undefined;
      const poNumber = pipeParts[3] ? pipeParts[3] : undefined;
      const productCode = pipeParts[4] ? pipeParts[4] : undefined;

      let weightLbs: number | undefined = undefined;
      if (pipeParts[5]) {
        const netLbsRaw = pipeParts[5].replace(/\D/g, '');
        if (netLbsRaw) {
          const parsedWeight = parseInt(netLbsRaw, 10);
          if (!isNaN(parsedWeight) && parsedWeight > 0) {
            weightLbs = parsedWeight;
          }
        }
      }

      let matchedSandType: string | null = null;
      if (productCode && mappings && mappings.length > 0) {
        const found = mappings.find(
          (m) => m.mineCode.trim().toLowerCase() === productCode.toLowerCase()
        );
        if (found) {
          matchedSandType = found.sandType;
        }
      }

      // Check if all six fields are present and valid
      const isWeightValid = weightLbs !== undefined && weightLbs > 0;
      const isProductValid = Boolean(productCode && productCode.length > 0);
      const isTruckValid = Boolean(truck && truck.length > 0);
      const isCarrierValid = Boolean(carrier && carrier.length > 0);
      const isPoValid = Boolean(poNumber && poNumber.length > 0);

      const isCleanSixPart =
        pipeParts.length === 6 &&
        isTicketValid &&
        isTruckValid &&
        isCarrierValid &&
        isPoValid &&
        isProductValid &&
        isWeightValid;

      const res: ParsedTicketScan = {
        rawValue: trimmed,
        isSixPartAtlas: isCleanSixPart,
        ticketNumber: normalizeTicketNumber(rawTicket),
        truck: truck || undefined,
        carrier: carrier || undefined,
        poNumber: poNumber || undefined,
        productCode: productCode || undefined,
        weightLbs: weightLbs,
        lbs: weightLbs || null,
        matchedSandType,
        confidence: isCleanSixPart ? 'confirmed' : 'probable',
        parser: isCleanSixPart ? 'atlas' : 'atlas-partial',
      };
      res.score = scoreCandidate(res);
      return res;
    }
    // If pipeParts[0] fails validation, do NOT scan other fields looking for a candidate —
    // fall through to blank as it does now.
  }

  // 2. Generic Labeled / Multi-line / Key-Value format
  // Handles: "Ticket: 762883\nPO: 1098347265987", "TKT# M1234; WT: 50000; PROD: 100M", etc.
  const hasLabels = /(?:TICKET|TKT|BOL|DELIVERY|LOAD|PO\b|PURCHASE|ORDER|WEIGHT|NET|LBS|PROD|PRODUCT|SAND|GRADE|CARRIER|HAULER|TRUCK)[\s_#:\-=]+/i.test(
    trimmed
  );

  if (hasLabels) {
    let extractedTicket: string | undefined = undefined;
    let extractedPO: string | undefined = undefined;
    let extractedWeight: number | undefined = undefined;
    let extractedProduct: string | undefined = undefined;
    let extractedTruck: string | undefined = undefined;
    let extractedCarrier: string | undefined = undefined;

    // Ticket label
    const ticketMatch = trimmed.match(
      /(?:(?:^|[\n\r,;|])\s*(?:TICKET|TKT|BOL|DELIVERY\s*#?|LOAD\s*#?)[\s_#:\-=]+([A-Z0-9\-_]+))/i
    );
    if (ticketMatch && ticketMatch[1]) {
      extractedTicket = normalizeTicketNumber(ticketMatch[1]);
    }

    // PO label
    const poMatch = trimmed.match(
      /(?:(?:^|[\n\r,;|])\s*(?:P\.?O\.?|PO\s*#|PURCHASE\s*ORDER|ORDER[\s_#:\-=]+)[\s_#:\-=]*([A-Z0-9\-_]+))/i
    );
    if (poMatch && poMatch[1]) {
      extractedPO = poMatch[1].trim();
    }

    // Weight label
    const wtMatch = trimmed.match(
      /(?:(?:^|[\n\r,;|])\s*(?:WEIGHT|NET\s*WT|NET|LBS|POUNDS)[\s_#:\-=]+([\d,]+))/i
    );
    if (wtMatch && wtMatch[1]) {
      const cleanNum = wtMatch[1].replace(/,/g, '');
      const parsedWt = parseInt(cleanNum, 10);
      if (!isNaN(parsedWt) && parsedWt > 0) {
        extractedWeight = parsedWt;
      }
    }

    // Product label
    const prodMatch = trimmed.match(
      /(?:(?:^|[\n\r,;|])\s*(?:PRODUCT|PROD|SAND|GRADE|MESH)[\s_#:\-=]+([A-Z0-9\s/\-_]+))/i
    );
    if (prodMatch && prodMatch[1]) {
      extractedProduct = prodMatch[1].trim();
    }

    // Truck label
    const truckMatch = trimmed.match(
      /(?:(?:^|[\n\r,;|])\s*(?:TRUCK|UNIT)[\s_#:\-=]+([A-Z0-9\-_]+))/i
    );
    if (truckMatch && truckMatch[1]) {
      extractedTruck = truckMatch[1].trim();
    }

    // Carrier label
    const carrierMatch = trimmed.match(
      /(?:(?:^|[\n\r,;|])\s*(?:CARRIER|HAULER)[\s_#:\-=]+([A-Z0-9\s\-_]+))/i
    );
    if (carrierMatch && carrierMatch[1]) {
      extractedCarrier = carrierMatch[1].trim();
    }

    if (extractedTicket) {
      let matchedSandType: string | null = null;
      if (extractedProduct && mappings && mappings.length > 0) {
        const found = mappings.find(
          (m) => m.mineCode.trim().toLowerCase() === extractedProduct!.toLowerCase()
        );
        if (found) {
          matchedSandType = found.sandType;
        }
      }

      const isConfirmed = Boolean(extractedWeight || extractedProduct || extractedPO);
      const res: ParsedTicketScan = {
        rawValue: trimmed,
        isSixPartAtlas: false,
        ticketNumber: extractedTicket,
        poNumber: extractedPO,
        weightLbs: extractedWeight,
        lbs: extractedWeight || null,
        productCode: extractedProduct,
        truck: extractedTruck,
        carrier: extractedCarrier,
        matchedSandType,
        confidence: isConfirmed ? 'confirmed' : 'probable',
        parser: 'generic_labeled',
      };
      res.score = scoreCandidate(res);
      return res;
    }
  }

  // 3. Check for obvious PO/Order prefix with no ticket label (e.g. "PO:1098347265987" or "PO1098347265987")
  if (/^(?:PO|ORDER|BOL|REF)[:#\-_]?\s*\d+$/i.test(trimmed)) {
    const res: ParsedTicketScan = {
      rawValue: trimmed,
      isSixPartAtlas: false,
      ticketNumber: undefined, // Do not guess PO as ticket!
      poNumber: trimmed,
      confidence: 'unknown',
      parser: 'unknown',
    };
    res.score = scoreCandidate(res);
    return res;
  }

  // 4. Single-token clean barcode (e.g. 1D Barcode 128 / Code 39 or single value QR: "M30134835" or "762883")
  // Rule: Must be single contiguous alphanumeric token (length 3 to 30) without spaces/newlines
  if (/^[a-zA-Z0-9\-_]{3,30}$/.test(trimmed)) {
    const norm = normalizeTicketNumber(trimmed);
    const res: ParsedTicketScan = {
      rawValue: trimmed,
      isSixPartAtlas: false,
      ticketNumber: norm,
      confidence: 'probable',
      parser: 'unknown',
    };
    res.score = scoreCandidate(res);
    return res;
  }

  // 5. Unknown / Unstructured Fallback:
  // BUG 2 FIX: Do NOT use longest alphanumeric substring fallback!
  // Return undefined ticketNumber and confidence = 'unknown'.
  const fallbackRes: ParsedTicketScan = {
    rawValue: trimmed,
    isSixPartAtlas: false,
    ticketNumber: undefined,
    confidence: 'unknown',
    parser: 'unknown',
  };
  fallbackRes.score = scoreCandidate(fallbackRes);
  return fallbackRes;
}

/**
 * Selects the best candidate from an array of detected barcode/QR symbols on the ticket.
 */
export function selectBestCandidate(
  candidates: { rawValue: string; format?: string }[],
  mappings: ProductCodeMapping[] = []
): {
  selected: ParsedTicketScan | null;
  candidates: ParsedTicketScan[];
  isAmbiguous: boolean;
} {
  if (!candidates || candidates.length === 0) {
    return { selected: null, candidates: [], isAmbiguous: false };
  }

  // Parse all unique candidates
  const seenRaw = new Set<string>();
  const parsedList: ParsedTicketScan[] = [];

  for (const c of candidates) {
    const raw = (c.rawValue || '').trim();
    if (!raw || seenRaw.has(raw)) continue;
    seenRaw.add(raw);

    const parsed = parseTicketScanValue(raw, mappings);
    if (c.format) parsed.format = c.format;
    parsedList.push(parsed);
  }

  if (parsedList.length === 0) {
    return { selected: null, candidates: [], isAmbiguous: false };
  }

  if (parsedList.length === 1) {
    return {
      selected: parsedList[0],
      candidates: parsedList,
      isAmbiguous: false,
    };
  }

  // Sort candidates by score descending
  parsedList.sort((a, b) => (b.score || 0) - (a.score || 0));

  const top1 = parsedList[0];
  const top2 = parsedList[1];

  const score1 = top1.score || 0;
  const score2 = top2.score || 0;

  // If top candidate has a clear decisive advantage (e.g. Atlas or confirmed vs unknown PO):
  if (score1 >= score2 + 25 && top1.confidence !== 'unknown') {
    return {
      selected: top1,
      candidates: parsedList,
      isAmbiguous: false,
    };
  }

  // Check if both top candidates have different plausible ticket numbers
  const hasDistinctTickets =
    top1.ticketNumber &&
    top2.ticketNumber &&
    normalizeTicketNumber(top1.ticketNumber) !== normalizeTicketNumber(top2.ticketNumber);

  return {
    selected: top1,
    candidates: parsedList,
    isAmbiguous: Boolean(hasDistinctTickets),
  };
}

/**
 * Extracts ticket number from raw scanned code (backward compatibility helper).
 */
export function extractTicketNumberFromScannedValue(decodedValue: string): string {
  const parsed = parseTicketScanValue(decodedValue, []);
  return parsed.ticketNumber ? normalizeTicketNumber(parsed.ticketNumber) : '';
}

/**
 * Finds duplicate delivery on current pad matching given ticket number.
 * Normalizes ticket numbers and strictly ignores soft-deleted tickets.
 */
export function findDuplicateDelivery(
  ticketNumber: string,
  deliveries: DeliveryTicket[] = []
): DeliveryTicket | null {
  const clean = normalizeTicketNumber(ticketNumber);
  if (!clean) return null;

  return (
    deliveries.find(
      (d) => !d.deleted && normalizeTicketNumber(d.ticketNumber) === clean
    ) || null
  );
}

/**
 * Checks if a soft-deleted ticket with the given ticket number exists in the audit history.
 */
export function findDeletedDelivery(
  ticketNumber: string,
  deletedDeliveries: DeliveryTicket[] = []
): DeliveryTicket | null {
  const clean = normalizeTicketNumber(ticketNumber);
  if (!clean) return null;

  return (
    deletedDeliveries.find(
      (d) => normalizeTicketNumber(d.ticketNumber) === clean
    ) || null
  );
}

const SESSION_SUPPLIER_KEY = 'sandtracker_last_supplier';

export function getLastUsedSupplier(): string {
  try {
    return sessionStorage.getItem(SESSION_SUPPLIER_KEY) || '';
  } catch {
    return '';
  }
}

export function setLastUsedSupplier(supplierName: string): void {
  try {
    if (supplierName && supplierName.trim()) {
      sessionStorage.setItem(SESSION_SUPPLIER_KEY, supplierName.trim());
    }
  } catch {
    // ignore
  }
}
