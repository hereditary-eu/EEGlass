#!/usr/bin/env python
import base64
import io
import time
import traceback

import pypdf
from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By

DPI = 96
PT_PER_INCH = 72
PX_TO_PT = PT_PER_INCH / DPI

SCREEN_WIDTH = 1728  # 18 inches * 96 DPI
SCREEN_HEIGHT = 1094  # 11.4 inches * 96 DPI

chrome_options = Options()
chrome_options.binary_location = "/usr/bin/brave-browser"

chrome_options.add_argument("--start-maximized")
chrome_options.add_argument("--disable-infobars")
chrome_options.add_argument("--disable-extensions")
chrome_options.add_argument("--disable-popup-blocking")

chrome_options.add_argument("--headless")
chrome_options.add_argument(f"--window-size={SCREEN_WIDTH},{SCREEN_HEIGHT}")

chrome_options.add_experimental_option("useAutomationExtension", value=False)
chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])

driver = webdriver.Chrome(options=chrome_options)
# note that in landscape mode, dimensions are inverted
PDF_PARAMS = {
    "landscape": True,
    "paperWidth": SCREEN_HEIGHT / DPI,
    "paperHeight": SCREEN_WIDTH / DPI,
    "printBackground": True,
    "marginTop": 0,
    "marginBottom": 0,
    "marginLeft": 0,
    "marginRight": 0,
}


def save_screenshot(filename: str):
    try:
        time.sleep(4)
        data = driver.execute_cdp_cmd("Page.printToPDF", PDF_PARAMS)
        with open(f"paper/figures/generated/{filename}", "wb") as file:
            file.write(base64.b64decode(data["data"]))
    except TimeoutException as error:
        print("something went wrong")
        print("".join(traceback.format_tb(error.__traceback__)))


def screenshot_element(css_selector: str, filename: str):
    try:
        time.sleep(4)
        data = driver.execute_cdp_cmd("Page.printToPDF", PDF_PARAMS)
        pdf_bytes = base64.b64decode(data["data"])

        element = driver.find_element(By.CSS_SELECTOR, css_selector)
        rect = driver.execute_script(
            "const r = arguments[0].getBoundingClientRect();"
            "const dpr = window.devicePixelRatio || 1;"
            "const scrollX = window.scrollX || 0, scrollY = window.scrollY || 0;"
            "return {left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height};",
            element,
        )

        reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
        writer = pypdf.PdfWriter()
        page = reader.pages[0]

        page_height_pt = float(page.mediabox.height)

        x0 = (rect["left"] - 4.0) * PX_TO_PT
        y0 = (rect["top"] - 4.0) * PX_TO_PT
        x1 = (rect["left"] + rect["width"]) * PX_TO_PT
        y1 = (rect["top"] + rect["height"]) * PX_TO_PT

        # PDF y-axis is bottom-up
        page.mediabox.lower_left = (x0, page_height_pt - y1)
        page.mediabox.upper_right = (x1, page_height_pt - y0)
        page.cropbox = page.mediabox
        writer.add_page(page)

        with open(f"paper/figures/generated/{filename}", "wb") as file:
            writer.write(file)
    except TimeoutException as error:
        print("something went wrong")
        print("".join(traceback.format_tb(error.__traceback__)))


driver.get("http://localhost:3000")
save_screenshot("overview.pdf")

driver.find_element(By.CSS_SELECTOR, ".vacp-debug-ui-button").click()
driver.find_element(By.CSS_SELECTOR, "#radix-_r_1_-trigger-chat").click()
save_screenshot("overview-with-vacp-panel-open.pdf")
screenshot_element(".vacp-debug-ui-panel", "vacp-panel.pdf")

driver.get("http://localhost:3000/datasets/ds004504/patients/sub-001")
save_screenshot("patient_view.pdf")

# driver.get("http://localhost:8000/docs")
# save_screenshot("api-docs.pdf")

driver.close()
driver.quit()
