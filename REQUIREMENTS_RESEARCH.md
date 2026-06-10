# MenuMetrics — Requirements & Primary Research Kit

Use this to understand what real restaurants need and to gather **primary research**
for your report (interviews + a short survey). Even 2–3 real responses strengthen
the "Case overview", "Methodology (business)" and "Results" sections.

---

## 1. What you are trying to learn

1. How does the restaurant currently track sales? (Which POS / kassa? Can it export data?)
2. How do they decide menu prices and which dishes to keep or drop?
3. Do they know which dishes actually make the most profit?
4. How much food do they throw away, and do they track its cost?
5. Who would use a tool like this, and on what device?
6. What would make them trust it / pay for it?

---

## 2. Data to collect about each restaurant's food

For the system to work you need, per restaurant:

- **Menu**: every dish, its selling price (so'm), and its category.
- **Recipes**: for each dish, the ingredients and quantities used.
- **Ingredient costs**: current purchase cost per unit (kg, litre, piece).
- **Sales**: daily units sold per dish (this is what the POS export provides).
- **Waste**: ingredients thrown away (quantity + reason), if they track it.
- **POS system**: name of their cash register / POS and whether it can export CSV/Excel.

A simple intake sheet (one row per dish, columns: dish, category, price, ingredients+quantities)
is enough to onboard a restaurant.

---

## 3. Interview guide (owner / manager — 15–20 min)

**Background**
1. What type of restaurant is this, and how many dishes are on your menu?
2. Roughly how many orders do you serve per day?

**Current sales tracking**
3. What system do you use to record orders and sales? (kassa / POS name)
4. Can that system export your sales (CSV, Excel, report)? How do you get daily numbers now?
5. Do you review which dishes sell best? How often, and how?

**Profitability**
6. Do you know the food cost of each dish? How did you work it out?
7. Which dishes do you *think* are most profitable? How sure are you?
8. Have you ever removed or repriced a dish? What made you decide?

**Waste**
9. How much food do you throw away in a typical week? Which ingredients most?
10. Do you record waste or its cost today?

**The product**
11. If a tool showed you which dishes to promote, reprice or cut — and where you lose money to waste — would you use it? Daily, weekly?
12. Who would enter or review the data? On a phone or computer?
13. What would worry you about using it (time, trust, cost)?
14. What would it need to do for you to pay for it?

---

## 4. Short survey (for several restaurants — 5 questions)

1. Which POS / cash register do you use? ____________
2. Can it export sales data?  □ Yes  □ No  □ Not sure
3. Do you currently know the profit margin of each dish?  □ Yes  □ Roughly  □ No
4. Do you track food waste cost?  □ Yes  □ No
5. How interested are you in a tool that analyses menu profit + waste?  (1 = not, 5 = very) ___

---

## 5. How to use the results in your report

- **Case overview / business case:** quote real answers (e.g. "3 of 4 owners could not state their most profitable dish").
- **Requirements:** turn answers into a functional requirements list (must import POS sales, must manage recipes, must flag waste, etc.).
- **Methodology (business):** describe this as primary research — sample, method (interview/survey), and limitations.
- **Validity/ethics:** keep responses anonymous; note small sample size as a limitation.
