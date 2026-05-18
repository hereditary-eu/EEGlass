#!/usr/bin/env python
import base64
import time
import traceback

from selenium import webdriver
from selenium.common.exceptions import TimeoutException
from selenium.webdriver.chrome.options import Options

chrome_options = Options()
chrome_options.binary_location = "/usr/bin/brave-browser"

chrome_options.add_argument("--start-maximized")
chrome_options.add_argument("--disable-infobars")
chrome_options.add_argument("--disable-extensions")
chrome_options.add_argument("--disable-popup-blocking")

chrome_options.add_argument("--headless")
chrome_options.add_argument("--window-size=1680,1080")

chrome_options.add_experimental_option("useAutomationExtension", value=False)
chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])

driver = webdriver.Chrome(options=chrome_options)

screenshot_width = 18
screenshot_height = 11.4
# note that in landscape mode, dimensions are inverted
PDF_PARAMS = {"landscape": True, "paperWidth": screenshot_height, "paperHeight": screenshot_width}


def save_screenshot(filename: str):
    try:
        time.sleep(4)
        data = driver.execute_cdp_cmd("Page.printToPDF", PDF_PARAMS)
        with open(f"paper/figures/generated/{filename}", "wb") as file:
            file.write(base64.b64decode(data["data"]))
    except TimeoutException as error:
        print("something went wrong")
        print("".join(traceback.format_tb(error.__traceback__)))


driver.get("http://localhost:3000")
save_screenshot("overview.pdf")

driver.get("http://localhost:3000/datasets/ds004504/patients/sub-001")
save_screenshot("patient_view.pdf")

driver.close()
driver.quit()
