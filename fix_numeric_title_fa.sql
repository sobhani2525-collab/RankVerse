-- Clear title_fa when it is only the original title in other digit script (e.g. 1917 / ۱۹۱۷)
UPDATE entities SET title_fa = NULL
WHERE title_fa IS NOT NULL
  AND translate(title_fa, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789') = translate(title, '۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩', '01234567890123456789');
