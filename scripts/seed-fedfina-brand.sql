-- Seed brand_context for Fedfina (brand_id = 'fedfina')
-- Source: investor_presentation_q3_fy_25.pdf and investor_presentation_q3_fy_26.pdf
-- Extracted: 2026-04-26
--
-- HOW TO RUN:
--   ~/.fly/bin/flyctl postgres connect --app fedfina-openbrain-db --database fedfina_openbrain
--   then paste this file, or:
--   ~/.fly/bin/flyctl postgres connect --app fedfina-openbrain-db --database fedfina_openbrain < scripts/seed-fedfina-brand.sql
--
-- Idempotent: safe to re-run. Uses ON CONFLICT (brand_id) DO UPDATE.
-- Hits two tables: brand_context (identity, tone, visual) and brand_knowledge (key facts).

BEGIN;

-- ── brand_context: identity, tone, visual guidelines ──

INSERT INTO brand_context (
  brand_id,
  display_name,
  industry,
  tone,
  tone_of_voice,
  target_audience,
  brand_guidelines,
  preferences,
  context_injection,
  updated_at
) VALUES (
  'fedfina',
  'Fedbank Financial Services Limited',
  'NBFC, retail lending (gold loans, mortgages or LAP, business loans)',
  'Formal, conservative, regulator-aware, numbers-first',
  'Formal Indian English business register. Numbers-first, every claim is quantified with YoY and QoQ where available, units are explicit (Rs Cr, %, bps). Declarative and measured, never aspirational. Forward-looking statements always carry caveats. Mirror the cadence of the investor deck: Business, Branches, Profitability, Asset Quality and Provisioning. Avoid first-person aspirational phrasing such as "we believe" or "we dream". Surface caveats rather than hide them. No em-dashes or en-dashes, use periods and commas.',
  'Primary: institutional investors and equity analysts. Secondary: regulators (RBI), rating agencies, lending counterparties. Tertiary: existing shareholders and listed-market press. Customer-facing language is not used in this format, customers are referenced statistically not narratively.',
  jsonb_build_object(
    'tagline', 'Empowering Emerging India with easy access to loans',
    'short_name', 'Fedfina',
    'legal_name', 'Fedbank Financial Services Limited',
    'cin', 'L65910MH1995PLC364635',
    'incorporated', 1995,
    'listings', jsonb_build_array(
      jsonb_build_object('exchange', 'NSE', 'symbol', 'FEDFINA'),
      jsonb_build_object('exchange', 'BSE', 'scrip_code', '544027')
    ),
    'registered_office', 'Unit No. 1101, 11th Floor, Cignus, Plot No 71 A, Paspoli, Powai, Mumbai 400087, Maharashtra',
    'web', 'www.fedfina.com',
    'email', 'customercare@fedfina.com',
    'colors', jsonb_build_object(
      'primary', '#0A3A8A',
      'primary_name', 'deep corporate navy',
      'secondary', '#F5A623',
      'secondary_name', 'warm gold amber',
      'background', '#FFFFFF',
      'accent_underline', '#F5A623'
    ),
    'fonts', jsonb_build_object(
      'heading', 'Inter',
      'body', 'Inter',
      'wordmark', 'custom bold italic-leaning geometric sans, FEDBANK lockup'
    ),
    'logo', jsonb_build_object(
      'description', 'Navy rectangular block with the wordmark FEDBANK above the line FINANCIAL SERVICES LIMITED in white. Accompanying brand mark is a stylized cross formed by two interlocking diamond or lozenge shapes, one navy and one gold, with curved navy stroke accents extending outward.',
      'primary_use', 'top-right corner of every slide'
    ),
    'slide_layout', jsonb_build_object(
      'header_ribbon', 'navy rounded-right ribbon, top-left, white text',
      'footer_rule', 'thin gold underline along slide bottom',
      'watermark', 'faint hex or cube pattern in top-right area'
    ),
    'bullet_glyph', 'navy filled triangle right-pointer (not round bullet)',
    'voice_samples', jsonb_build_array(
      'Empowering Emerging India with easy access to loans',
      'AUM Growth: 17.4% YoY increase to Rs 17,500 Cr (32.5% YoY Ex. Business Loans)',
      'Profit after tax is down 71.3% YoY to Rs 18.8 Cr, on account of prudent provisioning done to strengthen the balance sheet.',
      'In order to fortify the balance sheet, the company has prudently taken a one-time provision of Rs 75 Cr',
      'Forward looking statements concerning the Company''s future business prospects and business profitability are subject to a number of risks and uncertainties'
    )
  ),
  jsonb_build_object(
    'currency_unit', 'Rs Cr',
    'always_show_yoy_qoq', true,
    'asset_quality_caveats', 'always include',
    'forbid_em_dash', true,
    'forbid_en_dash', true,
    'forbid_emojis', true,
    'language_register', 'Indian English business formal'
  ),
  'You are writing for Fedbank Financial Services Limited (Fedfina), a listed NBFC focused on retail lending in emerging India (gold loans, mortgages including micro-LAP, business loans). Voice is formal, conservative, regulator-aware, and numbers-first. Always quantify with YoY and QoQ where source data supports it. Always include units (Rs Cr, %, bps). Mirror the deck cadence Business, Branches, Profitability, Asset Quality and Provisioning. Surface caveats rather than hide them. Never use aspirational fluff, em-dashes, en-dashes, or emojis. Default audience is institutional investors and equity analysts unless specified otherwise.',
  NOW()
)
ON CONFLICT (brand_id) DO UPDATE SET
  display_name           = EXCLUDED.display_name,
  industry               = EXCLUDED.industry,
  tone                   = EXCLUDED.tone,
  tone_of_voice          = EXCLUDED.tone_of_voice,
  target_audience        = EXCLUDED.target_audience,
  brand_guidelines       = EXCLUDED.brand_guidelines,
  preferences            = EXCLUDED.preferences,
  context_injection      = EXCLUDED.context_injection,
  updated_at             = NOW();


-- ── brand_knowledge: key facts Lucy should retrieve as RAG context ──

INSERT INTO brand_knowledge (brand_id, doc_type, content, updated_at) VALUES
('fedfina', 'company_overview',
 'Fedbank Financial Services Limited, brand short name Fedfina, is a listed retail-focused Non-Banking Financial Company (NBFC) headquartered in Powai, Mumbai. Incorporated 1995. CIN L65910MH1995PLC364635. Listed on NSE (symbol FEDFINA) and BSE (scrip code 544027). Tagline: Empowering Emerging India with easy access to loans. Core product lines are gold loans, mortgages (LAP including small-ticket micro-LAP), and business loans. Company Secretary and Compliance Officer is Rajaraman Sundaresan.',
 NOW()),
('fedfina', 'key_metrics_q3_fy26',
 'Q3 FY26 (quarter ended December 2025) headline metrics. AUM Rs 17,500 Cr, up 17.4% YoY and 8.5% QoQ. Disbursements in quarter Rs 8,606 Cr, up 95.8% YoY. Gold Loan AUM Rs 7,905 Cr, 51.9% YoY growth, 45.2% of total AUM. Mortgage AUM Rs 9,084 Cr, 20.0% YoY growth. Secured AUM 98.4% of book. Branches 730 (37 added YoY, 31 QoQ). Employees 5,085 plus 372 apprentices. Net Interest Income Rs 318.9 Cr, up 16.8% YoY. Operating Profit Rs 149.4 Cr, up 11.7% YoY. Profit After Tax Rs 87.9 Cr, up 368.6% YoY (FY25 base was depressed by one-time provisioning). GNPA 2.1%, NNPA 1.4%, Credit Cost 0.9%, RoA 2.5%, RoE 12.7%. Capital Adequacy Ratio (CRAR) 20.5%. Borrowings Rs 11,207 Cr. Shareholder funds Rs 2,806 Cr. Book Value per share Rs 75.0.',
 NOW()),
('fedfina', 'key_metrics_q3_fy25',
 'Q3 FY25 (quarter ended December 2024) reference metrics. AUM Rs 14,922 Cr, 39.3% YoY at the time. Gold loan AUM Rs 5,203 Cr (52.9% YoY, 34.9% mix). Mortgage AUM Rs 7,581 Cr (38.6% YoY). Disbursals Rs 4,395 Cr (31.4% YoY), gold loans Rs 3,441 Cr (54.7% YoY). Net Interest Income Rs 283.8 Cr, up 31.0% YoY, yield 17.5% (up 20 bps YoY). Operating Profit Rs 144.6 Cr, up 30.9% YoY, spreads 8.5% (up 16 bps QoQ). PAT Rs 18.8 Cr, down 71.3% YoY due to a one-time Rs 75 Cr provision (Rs 57 Cr on mortgage and discontinued construction finance NPAs, Rs 18 Cr management overlay). Gross Stage III 1.9%, Net Stage III 1.0%, Credit Cost 4.2% annualized. This base year is the comparator that makes Q3 FY26 PAT growth read as 368.6% YoY.',
 NOW()),
('fedfina', 'voice_and_format_rules',
 'Always present numbers with units (Rs Cr, %, bps). Pair growth metrics with both YoY and QoQ where source has both. Use the deck cadence: Business, Branches, Profitability, Asset Quality and Provisioning. Default register is Indian English business formal. Avoid first-person aspirational language. Treat asset quality and provisioning conservatively, surface caveats. No em-dashes, en-dashes, or emojis. Bullet glyph in slides is a navy filled triangle right-pointer.',
 NOW()),
('fedfina', 'visual_identity',
 'Primary color deep corporate navy approximately #0A3A8A. Secondary color warm gold amber approximately #F5A623. Background white. Slides carry a navy rounded-right ribbon header top-left, a thin gold underline at the bottom, and a faint hex or cube watermark in the top-right area. The brand block (FEDBANK wordmark over FINANCIAL SERVICES LIMITED on a navy rectangle) locks to the top-right of every slide. The brand mark beside the wordmark is a stylized cross formed by two interlocking diamond shapes, one navy and one gold, with curved navy stroke accents. Heading and body fonts are Inter (confirmed by V on 2026-04-26).',
 NOW())
ON CONFLICT (brand_id, doc_type) DO UPDATE SET
  content    = EXCLUDED.content,
  updated_at = NOW();

COMMIT;

-- Verification queries (run these after the seed):
--   SELECT brand_id, display_name, industry, LEFT(tone_of_voice, 80) AS tone_preview FROM brand_context WHERE brand_id = 'fedfina';
--   SELECT brand_id, doc_type, LEFT(content, 80) AS preview FROM brand_knowledge WHERE brand_id = 'fedfina' ORDER BY doc_type;
