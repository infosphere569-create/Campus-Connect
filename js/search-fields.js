export const normalizeSearchText=s=>String(s||"").toLowerCase().normalize("NFKC").replace(/\s+/g," ").trim();
export const makeSearchFields=(name="",text="")=>({searchName:normalizeSearchText(name),searchText:normalizeSearchText(text)});
