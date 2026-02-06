# Download Invoice

You are at %url% for carrier **%carrier%**.

## Task

1. Locate the group client **%clientName%** (Group Number: **%groupNumber%**)
2. Find and download the invoice for **%invoiceMonth% %invoiceYear%** (month number: **%invoiceMonthNumber%**, year: **%invoiceYear%**). Match any invoice where the month is %invoiceMonthNumber% and year is %invoiceYear% — ignore the day.

---

## Best Practices

### Kaiser Permanente

- **Avoid the search bar** - it is unreliable and often returns no results even for valid groups
- Navigate through the menu hierarchy instead: Billing > Account Management > Find your group
- The group list may take time to load - wait for it to fully populate
- Invoices are under "Billing Statements" or "View Statements"

### UHC (United Healthcare)

- Use OneHealthcare ID login flow when prompted
- After login, navigate to: Billing & Payments
- Search for the correct group by the ID not by name

### Guardian

- **If search returns an error, try again** - the search feature can be flaky
- Invoices are typically under the menu tab "Client billing"
- In Billing statements page, scroll slowly to make sure one can see all the invoices
- When the Save File dialog appears, click the Save button to complete the download. Do NOT report success until the file is actually saved

### Rippling

- Navigate to Benefits Administration after login
- Carrier invoices are under the specific benefit plan
- May need to select the correct pay period/billing cycle
- Documents section contains downloadable invoices

---

## Notes

- If the exact invoice date is not available, report `download_failed` with the dates that ARE available
- Always verify the downloaded document matches the requested date before reporting success
- If login fails, report `login_failed` with the specific error message
- If the group is not found, report `group_not_found` with the group number you searched for
