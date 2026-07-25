# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: gridPerformance.spec.ts >> Grid Overview Deadzone & Matrix Card Zoom E2E Spec >> verifies grid overview loading, matrix zoom slider scaling, and 0px deadzone drag indicator
- Location: e2e\gridPerformance.spec.ts:6:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('[data-testid="drop-indicator"]')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('[data-testid="drop-indicator"]')

```

```yaml
- button
- button "Datei"
- button "Werkzeuge"
- text: Auswahl
- button "Breite anpassen"
- button
- text: 144%
- button
- button [disabled]
- textbox: "1"
- text: von 60
- button
- button [disabled]
- button [disabled]
- button
- button
- button
- button
- button
- button "de"
- button "Exportieren"
- text: Lenovo G70-70 Z70-80 LCFC BALG1_AILG1_AILZ1 NM-A331 Rev 0.4 PDF .pdf
- button "Close tab (Ctrl+W)"
- button "Open document in new tab (Ctrl+N)"
- main:
  - text: "A A B B C C D D E E 1 1 2 2 3 3 4 4 Intel Haswell U-Processor with DDRIIIL + NV (N15V-GM/N15S-GT) GPU BALG1/AILG1/AILZ1 M/B Schematics Document 2014-06-28 REV:0.4 LCFC Confidential MB ： ： ： ： NMA331 Intel Broadwell U-Processor with DDRIIIL + NV (N16V-GM/N15S-GT) GPU Size Document Number Rev Date: Sheet of Security Classification LC Future Center Secret Data THIS SHEET OF ENGINEERING DRAWING IS THE PROPRIETARY PROPERTY OF LC FUTURE CENTER. AND CONTAINS CONFIDENTIAL AND TRADE SECRET INFORMATION. THIS SHEET MAY NOT BE TRANSFERED FROM THE CUSTODY OF THE COMPETENT DIVISION OF R&D DEPARTMENT EXCEPT AS AUTHORIZED BY LC FUTURE CENTER NEITHER THIS SHEET NOR THE INFORMATION IT CONTAINS MAY BE USED BY OR DISCLOSED TO ANY THIRD PARTY WITHOUT PRIOR WRITTEN CONSENT OF LC FUTURE CENTER. Issued Date Deciphered Date Title BILG1/AILG1/AILZ1 0.4 Cover Page Custom 1 60 Wednesday, July 16, 2014 2014/06/28 2015/06/28 Size Document Number Rev Date: Sheet of Security Classification LC Future Center Secret Data THIS SHEET OF ENGINEERING DRAWING IS THE PROPRIETARY PROPERTY OF LC FUTURE CENTER. AND CONTAINS CONFIDENTIAL AND TRADE SECRET INFORMATION. THIS SHEET MAY NOT BE TRANSFERED FROM THE CUSTODY OF THE COMPETENT DIVISION OF R&D DEPARTMENT EXCEPT AS AUTHORIZED BY LC FUTURE CENTER NEITHER THIS SHEET NOR THE INFORMATION IT CONTAINS MAY BE USED BY OR DISCLOSED TO ANY THIRD PARTY WITHOUT PRIOR WRITTEN CONSENT OF LC FUTURE CENTER. Issued Date Deciphered Date Title BILG1/AILG1/AILZ1 0.4 Cover Page Custom 1 60 Wednesday, July 16, 2014 2014/06/28 2015/06/28 Size Document Number Rev Date: Sheet of Security Classification LC Future Center Secret Data THIS SHEET OF ENGINEERING DRAWING IS THE PROPRIETARY PROPERTY OF LC FUTURE CENTER. AND CONTAINS CONFIDENTIAL AND TRADE SECRET INFORMATION. THIS SHEET MAY NOT BE TRANSFERED FROM THE CUSTODY OF THE COMPETENT DIVISION OF R&D DEPARTMENT EXCEPT AS AUTHORIZED BY LC FUTURE CENTER NEITHER THIS SHEET NOR THE INFORMATION IT CONTAINS MAY BE USED BY OR DISCLOSED TO ANY THIRD PARTY WITHOUT PRIOR WRITTEN CONSENT OF LC FUTURE CENTER. Issued Date Deciphered Date Title BILG1/AILG1/AILZ1 0.4 Cover Page Custom 1 60 Wednesday, July 16, 2014 2014/06/28 2015/06/28 A A B B C C D D E E 1 1 2 2 3 3 4 4 File Name : BALG1/AILG1/AILZ1 LCFC confidential DPx2 Lane SATA Gen1 SATA ODD RTL8106EUL (10M/100M) RTL8111GUL (1G) Codec UP TO 8G x 2 DDR3L-SO-DIMM X2 Page 14,15 SD/MMC Conn. 8MB PCI-Express USB Board POWER BOARD Sub-board for 17\" ODD Board SPK Conn. Haswell+NV (N15V-GM/N15S-GT) DDR3L*8 4GB/2GB VRAM 256/128*16 Haswell U 15W Broadwell U 15W BGA-1168 40mm*24mm Cardreader Realtek RTS5170 EC ITE IT8586E-LQFP Touch Pad Int.KBD Thermal Sensor NCT7718W HDMI Conn. 4x Gen2 USB Left USB 2.0 2x USB Right USB 3.0 1x NGFF Card WLAN&BT USB 2.0 1x PCIe 1x SATA Gen3 SATA HDD Conexant CX20752 HD Audio Int. MIC Conn. HP&Mic Combo Conn. SPI ROM SPI BUS PCIe 1x LAN Realtek RJ45 Conn. Memory BUS (DDR3L) Dual Channel 1.35V DDR3L 1600 MT/s USB2.0 1x USB 3.0 Port1 Intel MCP HDMI GB2B-64 Package DP to VGA Parade PS8613 VGA Conn. USB Board USB Board eDP x2 Lane eDP Conn USB2.0 1x USB2.0 1x USB2.0 Port5 SATA Port0 Int. Camera SATA Port1 PCIe Port3 USB2.0 Port0 USB2.0 Port3 USB2.0 Port6 PCIe Port4 Page 18~28 Page 24~27 Page 34 Page 35 Page 36 Page 33 Page 42 Page 42 Page 37 Page 38 Page 43 Page 43 Page 40 Page 07 Page 45 Page 45 Page 44 Page 39 Page 3~13 Page 41 USB 2.0 Port1 USB 2.0 Port2 SPI ROM 4MB Page 07 for reserve PCIe Port5 LED Board Broadwell+NV (N16V-GM/N15S-GT) Size Document Number Rev Date: Sheet of Security Classification LC Future Center Secret Data THIS SHEET OF ENGINEERING DRAWING IS THE PROPRIETARY PROPERTY OF LC FUTURE CENTER. AND CONTAINS CONFIDENTIAL AND TRADE SECRET INFORMATION. THIS SHEET MAY NOT BE TRANSFERED FROM THE CUSTODY OF THE COMPETENT DIVISION OF R&D DEPARTMENT EXCEPT AS AUTHORIZED BY LC FUTURE CENTER NEITHER THIS SHEET NOR THE INFORMATION IT CONTAINS MAY BE USED BY OR DISCLOSED TO ANY THIRD PARTY WITHOUT PRIOR WRITTEN CONSENT OF LC FUTURE CENTER. Issued Date Deciphered Date Title BILG1/AILG1/AILZ1 0.4 Block Diagram Custom 2 60 Wednesday, July 16, 2014 2014/06/28 2014/06/28 Size Document Number Rev Date: Sheet of Security Classification LC Future Center Secret Data THIS SHEET OF ENGINEERING DRAWING IS THE PROPRIETARY PROPERTY OF LC FUTURE CENTER. AND CONTAINS CONFIDENTIAL AND TRADE SECRET INFORMATION. THIS SHEET MAY NOT BE TRANSFERED FROM THE CUSTODY OF THE COMPETENT DIVISION OF R&D DEPARTMENT EXCEPT AS AUTHORIZED BY LC FUTURE CENTER NEITHER THIS SHEET NOR THE INFORMATION IT CONTAINS MAY BE USED BY OR DISCLOSED TO ANY THIRD PARTY WITHOUT PRIOR WRITTEN CONSENT OF LC FUTURE CENTER. Issued Date Deciphered Date Title BILG1/AILG1/AILZ1 0.4 Block Diagram Custom 2 60 Wednesday, July 16, 2014 2014/06/28 2014/06/28 Size Document Number Rev Date: Sheet of Security Classification LC Future Center Secret Data THIS SHEET OF ENGINEERING DRAWING IS THE PROPRIETARY PROPERTY OF LC FUTURE CENTER. AND CONTAINS CONFIDENTIAL AND TRADE SECRET INFORMATION. THIS SHEET MAY NOT BE TRANSFERED FROM THE CUSTODY OF THE COMPETENT DIVISION OF R&D DEPARTMENT EXCEPT AS AUTHORIZED BY LC FUTURE CENTER NEITHER THIS SHEET NOR THE INFORMATION IT CONTAINS MAY BE USED BY OR DISCLOSED TO ANY THIRD PARTY WITHOUT PRIOR WRITTEN CONSENT OF LC FUTURE CENTER. Issued Date Deciphered Date Title BILG1/AILG1/AILZ1 0.4 Block Diagram Custom 2 60 Wednesday, July 16, 2014 2014/06/28 2014/06/28 A A B B C C D D E E 1 1 2 2 3 3 4 4 VGA V X X SODIMM BATT IT8586E PCH Thermal Sensor WLAN WiMAX S5 S4/AC Only S3 S0 PCH IT8586E +3VS B+ S5 S4 AC & Battery don't exist S5 S4 Battery only V +1.35V +5VALW +3VALW +3VALW_PCH O O O O X O O O O +3VGS V EC_SMB_DA2 EC_SMB_CK2 X X O X X X V X X X X PCH_SMB_CLK SMBUS Control Table +3VALW_PCH V V X TP Module V X X X X X X X X X BOM Structure BTO Item BOM Structure Table X +3VS +3VS +3VALW_PCH X +3VS +3VS , X --> Means OFF ) ( O --> Means ON PCH 0001 0010 b Charger Rsvd Wlan need to update O S3 Battery only +3VALW_PCH O X O O O O X X X AOAC@ AOAC support part 100M LAN Part 100M@ N15SGT@ ME@ UMA@ OPT@ GIGA@ TS@ N15VGM@ RANKB@ RANKA@ Not stuff ME part(connector, hole) UMA SKU part Discrete GPU SKU part GIGA LAN Part @ For support touch panel sku part For N15V-GM part For VRAM RankB part For VRAM RankA part For N15S-GT GPU part 4 LAN 2 3 5 1 USB Port1 (Left Side) PCIE PORT LIST WLAN Device Port Camera USB 2.0 USB 3.0 USB Port (Right Side) 5 4 2 1 0 7 6 EHCI1 USB Port Table NGFF(WLAN) XHCI 3 0x41(default) VGA TOUCH PANEL Cardreader USB Port2 (Left Side) Discrete GPU 6 2 1 X PCH_SMB_DATA USB Port1 (Left Side) 4 3 +0.95VGS +1.5VS O +3VALW V V charger V +3VGS +1.35VGS +0.675VS X EC_SMB_DA1 EC_SMB_CK1 IT8586E SOURCE +3VALW SLP_S5# SLP_S4# SLP_S3# SLP_S1# S5 (Soft OFF) S4 (Suspend to Disk) S3 (Suspend to RAM) S1(Power On Suspend) Full ON SIGNAL STATE ON ON ON ON ON ON ON Voltage Rails Clock +VS +V +VALW LOW LOW LOW LOW OFF OFF OFF OFF OFF OFF OFF OFF ON ON ON ON HIGH HIGH HIGH HIGH HIGH HIGH HIGH HIGH HIGH LOW LOW LOW LOW LOW LOW LOW State O Power Plane CPU_CORE +5VS +3VS HIGH PCH SM Bus address 1010 010Xb DDR DIMMB 1010 000Xb DDR DIMMA Device EC SM Bus1 address 1001_100xb Thermal Sensor NCT7718W +VGA_CORE +1.05VS +1.8VGS +1.35VS 0X16 Smart Battery Device EC SM Bus2 address Address Address Device GC62.0 support part GC6@ BDW@ Follow BDW CPU HSW@ Follow HSW CPU CD@ Follow cost down N16VGM@ For N16V-GM part Size Document Number Rev Date: Sheet of Security Classification LC Future Center Secret Data THIS SHEET OF ENGINEERING DRAWING IS THE PROPRIETARY PROPERTY OF LC FUTURE CENTER. AND CONTAINS CONFIDENTIAL AND TRADE SECRET INFORMATION. THIS SHEET MAY NOT BE TRANSFERED FROM THE CUSTODY OF THE COMPETENT DIVISION OF R&D DEPARTMENT EXCEPT AS AUTHORIZED BY LC FUTURE CENTER NEITHER THIS SHEET NOR THE INFORMATION IT CONTAINS MAY BE USED BY OR DISCLOSED TO ANY THIRD PARTY WITHOUT PRIOR WRITTEN CONSENT OF LC FUTURE CENTER. Issued Date Deciphered Date Title BILG1/AILG1/AILZ1 0.4 Notes List Custom 3 60 Wednesday, July 16, 2014 2014/06/28 2015/06/28 Size Document Number Rev Date: Sheet of Security Classification LC Future Center Secret Data THIS SHEET OF ENGINEERING DRAWING IS THE PROPRIETARY PROPERTY OF LC FUTURE CENTER. AND CONTAINS CONFIDENTIAL AND TRADE SECRET INFORMATION. THIS SHEET MAY NOT BE TRANSFERED FROM THE CUSTODY OF THE COMPETENT DIVISION OF R&D DEPARTMENT EXCEPT AS AUTHORIZED BY LC FUTURE CENTER NEITHER THIS SHEET NOR THE INFORMATION IT CONTAINS MAY BE USED BY OR DISCLOSED TO ANY THIRD PARTY WITHOUT PRIOR WRITTEN CONSENT OF LC FUTURE CENTER. Issued Date Deciphered Date Title BILG1/AILG1/AILZ1 0.4 Notes List Custom 3 60 Wednesday, July 16, 2014 2014/06/28 2015/06/28 Size Document Number Rev Date: Sheet of Security Classification LC Future Center Secret Data THIS SHEET OF ENGINEERING DRAWING IS THE PROPRIETARY PROPERTY OF LC FUTURE CENTER. AND CONTAINS CONFIDENTIAL AND TRADE SECRET INFORMATION. THIS SHEET MAY NOT BE TRANSFERED FROM THE CUSTODY OF THE COMPETENT DIVISION OF R&D DEPARTMENT EXCEPT AS AUTHORIZED BY LC FUTURE CENTER NEITHER THIS SHEET NOR THE INFORMATION IT CONTAINS MAY BE USED BY OR DISCLOSED TO ANY THIRD PARTY WITHOUT PRIOR WRITTEN CONSENT OF LC FUTURE CENTER. Issued Date Deciphered Date Title BILG1/AILG1/AILZ1 0.4 Notes List Custom 3 60 Wednesday, July 16, 2014 2014/06/28 2015/06/28"
  - img "Page 4 preview"
  - img "Page 5 preview"
  - img "Page 6 preview"
  - img "Page 7 preview"
  - img "Page 8 preview"
  - img "Page 9 preview"
  - img "Page 10 preview"
  - img "Page 11 preview"
  - img "Page 12 preview"
  - img "Page 13 preview"
  - img "Page 14 preview"
  - img "Page 15 preview"
  - img "Page 16 preview"
  - img "Page 17 preview"
  - img "Page 18 preview"
  - img "Page 19 preview"
  - img "Page 20 preview"
  - img "Page 21 preview"
  - img "Page 22 preview"
  - img "Page 23 preview"
  - img "Page 24 preview"
  - img "Page 25 preview"
  - img "Page 26 preview"
  - img "Page 27 preview"
  - img "Page 28 preview"
  - img "Page 29 preview"
  - img "Page 30 preview"
  - img "Page 31 preview"
  - img "Page 32 preview"
  - img "Page 33 preview"
  - img "Page 34 preview"
  - img "Page 35 preview"
  - img "Page 36 preview"
  - img "Page 37 preview"
  - img "Page 38 preview"
  - img "Page 39 preview"
  - img "Page 40 preview"
  - img "Page 41 preview"
  - img "Page 42 preview"
  - img "Page 43 preview"
  - img "Page 44 preview"
  - img "Page 45 preview"
  - img "Page 46 preview"
  - img "Page 47 preview"
  - img "Page 48 preview"
  - img "Page 49 preview"
  - img "Page 50 preview"
  - img "Page 51 preview"
  - img "Page 52 preview"
  - img "Page 53 preview"
  - img "Page 54 preview"
  - img "Page 55 preview"
  - img "Page 56 preview"
  - img "Page 57 preview"
  - img "Page 58 preview"
  - img "Page 59 preview"
  - img "Page 60 preview"
- heading "Seitenübersicht" [level=2]
- text: (Lange drücken zum Umsortieren per Touch) 180%
- slider "Matrix Zoom": "180"
- button "Close grid overview"
- text: "1"
- button
- text: "2"
- button
- text: "3"
- button
- text: "4"
- button
- text: "5"
- button
- text: "6"
- button
- text: "7"
- button
- text: "8"
- button
- text: "9"
- button
- text: "10"
- button
- text: "11"
- button
- text: "12"
- button
- text: "13"
- button
- text: "14"
- button
- text: "15"
- button
- text: "16"
- button
- text: "17"
- button
- text: "18"
- button
- text: "19"
- button
- text: "20"
- button
- text: "21"
- button
- text: "22"
- button
- text: "23"
- button
- text: "24"
- button
- text: "25"
- button
- text: "26"
- button
- text: "27"
- button
- text: "28"
- button
- text: "29"
- button
- text: "30"
- button
- text: "31"
- button
- text: "32"
- button
- text: "33"
- button
- text: "34"
- button
- text: "35"
- button
- text: "36"
- button
- text: "37"
- button
- text: "38"
- button
- text: "39"
- button
- text: "40"
- button
- text: "41"
- button
- text: "42"
- button
- text: "43"
- button
- text: "44"
- button
- text: "45"
- button
- text: "46"
- button
- text: "47"
- button
- text: "48"
- button
- text: "49"
- button
- text: "50"
- button
- text: "51"
- button
- text: "52"
- button
- text: "53"
- button
- text: "54"
- button
- text: "55"
- button
- text: "56"
- button
- text: "57"
- button
- text: "58"
- button
- text: "59"
- button
- text: "60"
- button
- button "Feedback"
- region "Notifications alt+T"
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | import path from "path";
  3  | import fs from "fs";
  4  | 
  5  | test.describe("Grid Overview Deadzone & Matrix Card Zoom E2E Spec", () => {
  6  |   test("verifies grid overview loading, matrix zoom slider scaling, and 0px deadzone drag indicator", async ({ page }) => {
  7  |     fs.mkdirSync(path.join(process.cwd(), "e2e", "screenshots"), { recursive: true });
  8  | 
  9  |     await page.goto("http://localhost:5173/");
  10 | 
  11 |     const fileInput = page.locator('input[type="file"]').first();
  12 |     const pdfPath = path.join(
  13 |       process.cwd(),
  14 |       "test pdfs/Lenovo G70-70 Z70-80 LCFC BALG1_AILG1_AILZ1 NM-A331 Rev 0.4 PDF .pdf"
  15 |     );
  16 | 
  17 |     expect(fs.existsSync(pdfPath)).toBe(true);
  18 |     await fileInput.setInputFiles(pdfPath);
  19 | 
  20 |     // Wait for document canvas or text layer to render
  21 |     await page.locator(".pdf-text-layer span, canvas").first().waitFor({ state: "visible", timeout: 15000 });
  22 | 
  23 |     // Open Grid Overview modal
  24 |     const viewModeTrigger = page.locator('[data-testid="view-mode-trigger"]');
  25 |     await viewModeTrigger.waitFor({ state: "visible", timeout: 8000 });
  26 |     await viewModeTrigger.click();
  27 | 
  28 |     const gridOverviewMenuItem = page.locator('[data-testid="grid-overview-item"]');
  29 |     await gridOverviewMenuItem.waitFor({ state: "visible", timeout: 5000 });
  30 |     await gridOverviewMenuItem.click();
  31 | 
  32 |     // Verify Grid Overview items loaded
  33 |     const gridItem0 = page.locator('[data-testid="grid-item-0"]');
  34 |     await gridItem0.waitFor({ state: "visible", timeout: 10000 });
  35 | 
  36 |     // Verify matrix zoom slider exists and scales thumbnail cards without lag
  37 |     const zoomSlider = page.locator('[data-testid="matrix-zoom-slider"]');
  38 |     await expect(zoomSlider).toBeVisible();
  39 | 
  40 |     const initialBox = await gridItem0.boundingBox();
  41 |     expect(initialBox).not.toBeNull();
  42 | 
  43 |     // Scale matrix zoom slider to 180%
  44 |     await zoomSlider.fill("180");
  45 |     await zoomSlider.dispatchEvent("input");
  46 |     await zoomSlider.dispatchEvent("change");
  47 | 
  48 |     // Allow UI to re-layout with new column width
  49 |     await page.waitForTimeout(300);
  50 | 
  51 |     const scaledBox = await gridItem0.boundingBox();
  52 |     expect(scaledBox).not.toBeNull();
  53 |     expect(scaledBox!.width).toBeGreaterThan(initialBox!.width);
  54 | 
  55 |     // Drag page thumbnail over contiguous border (0px deadzone verification)
  56 |     const gridItem1 = page.locator('[data-testid="grid-item-1"]');
  57 |     await expect(gridItem1).toBeVisible();
  58 | 
  59 |     const box1 = (await gridItem1.boundingBox())!;
  60 |     const borderX = box1.x + 5;
  61 |     const targetY = box1.y + box1.height / 2;
  62 | 
  63 |     await gridItem0.dispatchEvent("dragstart");
  64 |     await gridItem1.dispatchEvent("dragover", { clientX: borderX, clientY: targetY });
  65 | 
  66 |     // Verify dragOver indicator is active without flickering
  67 |     const dropIndicator = page.locator('[data-testid="drop-indicator"]');
> 68 |     await expect(dropIndicator).toBeVisible();
     |                                 ^ Error: expect(locator).toBeVisible() failed
  69 | 
  70 |     // Save proof screenshot
  71 |     const screenshotPath = path.join(process.cwd(), "e2e/screenshots/grid_matrix_proof.png");
  72 |     await page.screenshot({ path: screenshotPath, fullPage: true });
  73 |     expect(fs.existsSync(screenshotPath)).toBe(true);
  74 |     console.log(`[E2E Proof Screenshot Saved]: ${screenshotPath}`);
  75 |   });
  76 | });
  77 | 
```