# Download Invoice

You are at %url% for carrier **%carrier%**.

## Task

1. Locate the group client **%clientName%** (Group Number: **%groupNumber%**)
2. Find and download the invoice for **%invoiceMonth% %invoiceYear%**

---

## Best Practices

### Kaiser Permanente

- **Avoid the search bar** - it is unreliable and often returns no results even for valid groups
- Navigate through the menu hierarchy instead: Billing > Account Management > Find your group
- The group list may take time to load - wait for it to fully populate
- Invoices are under "Billing Statements" or "View Statements"

### UHC (United Healthcare)

- **Follow navigation through all windows** - UHC opens multiple tabs/windows during navigation
- Use OneHealthcare ID login flow when prompted
- After login, navigate to: Billing & Payments > View Billing Statements
- Select the correct account from the dropdown if multiple accounts exist
- The invoice PDF may open in a new window - ensure you download from the correct window

### Guardian

- **If search returns an error, try again** - the search feature can be flaky
- Use the "Accounts" or "Groups" section to find your client
- Invoices are typically under "Billing" > "Statements" or "View Bills"
- Guardian may require selecting a specific coverage type (Dental, Vision, Life) before showing invoices

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
