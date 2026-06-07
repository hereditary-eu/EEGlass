#!/usr/bin/env python
import base64
import json
import time
import traceback
from pathlib import Path

import pymupdf
from selenium import webdriver
from selenium.common.exceptions import ElementClickInterceptedException, TimeoutException
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait

DPI = 96
PT_PER_INCH = 72
PX_TO_PT = PT_PER_INCH / DPI
CROP_PADDING_PX = 4.0
PDF_SETTLE_SECONDS = 4

SCREEN_WIDTH = 1728
SCREEN_HEIGHT = 1094
INTROSPECTION_SCREEN_WIDTH = 1000
INTROSPECTION_SCREEN_HEIGHT = 900
INTROSPECTION_CROP_VERTICAL_PADDING_PX = 0.0

PATIENT_VIEW_WINDOW_NUMBER = 53

OUTPUT_DIR = Path("paper/figures/generated")

APP_URL = "http://localhost:3000"
PATIENT_URL = f"{APP_URL}/datasets/ds004504/patients/sub-023"


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
wait = WebDriverWait(driver, 30)

# In Chrome printToPDF landscape mode, paper dimensions are inverted.
PDF_PARAMS = {
    "landscape": True,
    "paperWidth": SCREEN_HEIGHT / DPI,
    "paperHeight": SCREEN_WIDTH / DPI,
    "printBackground": True,
    "marginTop": 0,
    "marginBottom": 0,
    "marginLeft": 0,
    "marginRight": 0,
    "pageRanges": "1",
}


def save_screenshot(filename: str, pdf_params=PDF_PARAMS):
    try:
        time.sleep(PDF_SETTLE_SECONDS)
        data = driver.execute_cdp_cmd("Page.printToPDF", pdf_params)
        (OUTPUT_DIR / filename).write_bytes(base64.b64decode(data["data"]))
    except TimeoutException as error:
        print("something went wrong")
        print("".join(traceback.format_tb(error.__traceback__)))


def get_element_rect(css_selector: str):
    element = wait_for_visible(css_selector)
    rect = driver.execute_script(
        "const r = arguments[0].getBoundingClientRect();"
        "const scrollX = window.scrollX || 0, scrollY = window.scrollY || 0;"
        "return {left: r.left + scrollX, top: r.top + scrollY, width: r.width, height: r.height};",
        element,
    )
    return rect


def crop_pdf_to_rect(
    pdf_bytes: bytes,
    rect: dict[str, float],
    padding_px: float = CROP_PADDING_PX,
    padding_left_px: float | None = None,
    padding_right_px: float | None = None,
    padding_top_px: float | None = None,
    padding_bottom_px: float | None = None,
) -> bytes:
    source_pdf = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    cropped_pdf = pymupdf.open()
    try:
        left_padding = padding_px if padding_left_px is None else padding_left_px
        right_padding = padding_px if padding_right_px is None else padding_right_px
        top_padding = padding_px if padding_top_px is None else padding_top_px
        bottom_padding = padding_px if padding_bottom_px is None else padding_bottom_px
        full = source_pdf[0].rect
        x0 = max(full.x0, (rect["left"] - left_padding) * PX_TO_PT)
        y0 = max(full.y0, (rect["top"] - top_padding) * PX_TO_PT)
        x1 = min(full.x1, (rect["left"] + rect["width"] + right_padding) * PX_TO_PT)
        y1 = min(full.y1, (rect["top"] + rect["height"] + bottom_padding) * PX_TO_PT)
        clip = pymupdf.Rect(x0, y0, x1, y1)

        # Redact the four strips outside the clip so their content is truly removed
        # from the stream (not just hidden), making the result clean in Inkscape.
        for strip in [
            pymupdf.Rect(full.x0, full.y0, full.x1, clip.y0),
            pymupdf.Rect(full.x0, clip.y1, full.x1, full.y1),
            pymupdf.Rect(full.x0, clip.y0, clip.x0, clip.y1),
            pymupdf.Rect(clip.x1, clip.y0, full.x1, clip.y1),
        ]:
            if not strip.is_empty:
                source_pdf[0].add_redact_annot(strip)
        source_pdf[0].apply_redactions(
            images=pymupdf.PDF_REDACT_IMAGE_PIXELS,
            graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_COVERED,
        )

        cropped_page = cropped_pdf.new_page(width=clip.width, height=clip.height)
        cropped_page.show_pdf_page(cropped_page.rect, source_pdf, 0, clip=clip)
        return cropped_pdf.tobytes(garbage=4, deflate=True)
    finally:
        cropped_pdf.close()
        source_pdf.close()


def screenshot_element(
    css_selector: str,
    filename: str,
    pdf_params=PDF_PARAMS,
    padding_px: float = CROP_PADDING_PX,
    padding_left_px: float | None = None,
    padding_right_px: float | None = None,
    padding_top_px: float | None = None,
    padding_bottom_px: float | None = None,
):
    rect = get_element_rect(css_selector)
    time.sleep(PDF_SETTLE_SECONDS)
    data = driver.execute_cdp_cmd("Page.printToPDF", pdf_params)
    (OUTPUT_DIR / filename).write_bytes(
        crop_pdf_to_rect(
            base64.b64decode(data["data"]),
            rect,
            padding_px,
            padding_left_px,
            padding_right_px,
            padding_top_px,
            padding_bottom_px,
        ),
    )


def wait_for_visible(css_selector: str):
    return wait.until(EC.visibility_of_element_located((By.CSS_SELECTOR, css_selector)))


def click_when_ready(css_selector: str):
    element = wait.until(EC.element_to_be_clickable((By.CSS_SELECTOR, css_selector)))
    try:
        element.click()
    except ElementClickInterceptedException:
        driver.execute_script("arguments[0].click();", element)
    return element


def configure_vacp_chat_for_screenshot():
    config = {
        "provider": "openai-compatible",
        "providerName": "openai-compatible",
        "baseURL": "https://api.openai.com/v1",
        "apiKey": "sk-screenshot-dummy",
        "model": "gpt-5.2",
        "temperature": 0.2,
        "maxSteps": 10,
        "maxOutputTokens": 900,
    }
    stored_config = {
        "version": 2,
        "activeProvider": "openai-compatible",
        "providerConfigs": {"openai-compatible": config},
    }
    driver.execute_script(
        "window.localStorage.setItem(arguments[0], arguments[1]);",
        "vacp:debug:chat:llmConfig:v1",
        json.dumps(stored_config),
    )


def close_vacp_chat_settings_if_open():
    if not driver.find_elements(By.CSS_SELECTOR, "[data-vacp-chat-settings-panel='1']"):
        return

    close_buttons = driver.find_elements(
        By.CSS_SELECTOR, "[data-vacp-chat-settings-panel='1'] [aria-label='Close settings']"
    )
    if close_buttons:
        try:
            close_buttons[0].click()
        except ElementClickInterceptedException:
            driver.execute_script("arguments[0].click();", close_buttons[0])
        wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR, "[data-vacp-chat-settings-panel='1']")))


def prepare_vacp_chat_prompt(prompt: str):
    click_when_ready(".vacp-debug-ui-button")
    wait_for_visible(".vacp-debug-ui-panel")
    configure_vacp_chat_for_screenshot()
    click_when_ready(".vacp-debug-ui-module[title='Chat']")
    close_vacp_chat_settings_if_open()

    chat_inputs = driver.find_elements(By.CSS_SELECTOR, "#vacp-chat-input")
    if chat_inputs:
        chat_inputs[0].click()
        chat_inputs[0].clear()
        chat_inputs[0].send_keys(prompt)


def select_patient_window(window_number: int):
    window_index = window_number - 1
    if window_index < 0:
        raise ValueError("window_number is 1-based and must be at least 1")

    wait.until(
        lambda active_driver: active_driver.execute_script(
            "return Boolean(window.__vacp && typeof window.__vacp.execute === 'function');"
        )
    )
    result = driver.execute_async_script(
        """
        const done = arguments[arguments.length - 1];
        window.__vacp.execute({
          callId: `screenshot-window-${Date.now()}`,
          name: "patient_view.timeseries.window_set",
          params: { windowIndex: arguments[0] },
        }).then(done).catch((error) => done({ ok: false, error: String(error) }));
        """,
        window_index,
    )
    if not result or not result.get("ok"):
        raise RuntimeError(f"Unable to select patient window {window_number}: {result}")

    wait.until(
        lambda active_driver: (
            f"Window {window_number}:" in active_driver.find_element(By.CSS_SELECTOR, ".timeseries-slot-subtitle").text
        )
    )
    time.sleep(1)


def open_introspection_view():
    driver.set_window_size(INTROSPECTION_SCREEN_WIDTH, INTROSPECTION_SCREEN_HEIGHT)
    click_when_ready(".window-embedding-panel .embedding-introspection-trigger")
    wait_for_visible(".embedding-introspection-dialog")
    wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR, ".embedding-introspection-empty")))
    wait_for_visible(".embedding-introspection-table-section .cif-data-table")


def configure_introspection_table():
    if not driver.find_elements(By.CSS_SELECTOR, ".embedding-introspection-table-section .compressedViewContainer"):
        click_when_ready(".embedding-introspection-table-section .toggleViewButton[aria-label='Compress table']")
        wait_for_visible(".embedding-introspection-table-section .compressedViewContainer")

    for column_name in ["theta activation", "alpha activation"]:
        wait.until(
            lambda active_driver: active_driver.execute_script(
                """
                const targetText = arguments[0].toLowerCase();
                const cells = [...document.querySelectorAll(
                  ".embedding-introspection-table-section td.columnName"
                )];
                const cell = cells.find((item) => item.textContent.trim().toLowerCase() === targetText);
                if (!cell) return false;
                if (!cell.classList.contains("selectedCompressedColumn")) cell.click();
                return cell.classList.contains("selectedCompressedColumn");
                """,
                column_name,
            )
        )


def click_button_with_text(container_selector: str, button_text: str):
    result = driver.execute_script(
        """
        const container = document.querySelector(arguments[0]);
        if (!container) return { ok: false, error: `Missing container ${arguments[0]}` };
        const targetText = arguments[1].trim().toLowerCase();
        const button = [...container.querySelectorAll("button")].find(
          (item) => item.textContent.trim().toLowerCase() === targetText
        );
        if (!button) return { ok: false, error: `Missing button ${arguments[1]}` };
        if (button.disabled) return { ok: false, error: `Button ${arguments[1]} is disabled` };
        button.click();
        return { ok: true };
        """,
        container_selector,
        button_text,
    )
    if not result or not result.get("ok"):
        raise RuntimeError(result.get("error") if result else f"Unable to click {button_text}")


def capture_overview():
    print("Capturing overview")
    wait.until(lambda active_driver: active_driver.execute_script("return document.readyState") == "complete")
    wait_for_visible(".overview-panel")
    click_when_ready(".overview-dataset-row .overview-drill-button")
    wait_for_visible(".overview-patient-list")
    save_screenshot("overview.pdf")


def open_patient_view():
    print(f"Opening patient view: {PATIENT_URL}")
    driver.get(PATIENT_URL)
    time.sleep(5)
    select_patient_window(PATIENT_VIEW_WINDOW_NUMBER)


def capture_patient_view():
    print("Capturing patient view")
    driver.set_window_size(SCREEN_WIDTH, SCREEN_HEIGHT)
    save_screenshot("patient-view.pdf")


def capture_introspection_view():
    print("Capturing introspection view")
    hide_style_id = "vacp-screenshot-hide-launcher"
    driver.execute_script(
        """
        let style = document.getElementById(arguments[0]);
        if (!style) {
          style = document.createElement("style");
          style.id = arguments[0];
          document.head.appendChild(style);
        }
        style.textContent = ".vacp-debug-ui-button { display: none !important; }";
        """,
        hide_style_id,
    )
    try:
        open_introspection_view()
        configure_introspection_table()

        introspection_pdf_params = PDF_PARAMS.copy()
        introspection_pdf_params["paperWidth"] = INTROSPECTION_SCREEN_HEIGHT / DPI
        introspection_pdf_params["paperHeight"] = INTROSPECTION_SCREEN_WIDTH / DPI

        screenshot_element(
            ".embedding-introspection-dialog",
            "introspection.pdf",
            introspection_pdf_params,
            padding_top_px=INTROSPECTION_CROP_VERTICAL_PADDING_PX,
            padding_bottom_px=INTROSPECTION_CROP_VERTICAL_PADDING_PX,
        )
        click_when_ready(".embedding-introspection-close")
        wait.until(EC.invisibility_of_element_located((By.CSS_SELECTOR, ".embedding-introspection-dialog")))
    finally:
        driver.execute_script(
            """
            const style = document.getElementById(arguments[0]);
            if (style) style.remove();
            """,
            hide_style_id,
        )


def capture_total_band_power():
    print("Capturing total band power")
    driver.set_window_size(SCREEN_WIDTH, SCREEN_HEIGHT)

    tbp_slot_selector = "article.patient-view-slot:has(> .topology-bandpower)"  # select the containing article of the total band power slot
    tbp_screenshot_layout_style_id = "tbp-screenshot-layout-order"

    # switches the top row and bottom row of the patient view panel

    driver.execute_script(
        """
        let style = document.getElementById(arguments[0]);
        if (!style) {
          style = document.createElement("style");
          style.id = arguments[0];
          document.head.appendChild(style);
        }
        style.textContent = `
          .patient-view-panel > .patient-view-slot:nth-of-type(1) {
            order: 4 !important;
          }

          .patient-view-panel > .patient-view-slot:nth-of-type(2) {
            order: 5 !important;
          }

          .patient-view-panel > .patient-view-slot:nth-of-type(3) {
            order: 1 !important;
          }

          .patient-view-panel > .patient-view-slot:nth-of-type(4) {
            order: 2 !important;
          }

          .patient-view-panel > .patient-view-slot:nth-of-type(5) {
            order: 3 !important;
          }
        `;
        window.dispatchEvent(new Event("resize"));
        """,
        tbp_screenshot_layout_style_id,
    )

    wait_for_visible(tbp_slot_selector)
    wait_for_visible(".topology-bandpower")
    wait_for_visible(".topology-bandpower-plot svg")
    click_button_with_text(".topology-bandpower", "Inter")
    wait_for_visible(".topology-bandpower-cohort-selector")
    click_button_with_text(".topology-bandpower-cohort-selector", "H")
    wait.until(
        lambda active_driver: (
            "H patient means"
            in active_driver.find_element(By.CSS_SELECTOR, ".topology-bandpower-range-controls > span").text
        )
    )
    wait_for_visible(".topology-bandpower-plot svg")
    time.sleep(1)

    screenshot_element(tbp_slot_selector, "total-bandpower.pdf")

    # restore the patient view panel rows
    driver.execute_script(
        """
        const style = document.getElementById(arguments[0]);
        if (style) style.remove();
        """,
        tbp_screenshot_layout_style_id,
    )


def capture_vacp_panel():
    print("Capturing VACP panel")
    driver.set_window_size(SCREEN_WIDTH, SCREEN_HEIGHT)
    time.sleep(1)
    prepare_vacp_chat_prompt(
        "In the active patient view, take the highest confidence time window predicted as healthy."
    )
    time.sleep(1)
    screenshot_element(
        ".vacp-debug-ui-panel",
        "vacp-panel.pdf",
        padding_left_px=1.0,
        padding_right_px=-2.0,
        padding_bottom_px=-2.0,
        padding_top_px=1.0,
    )


driver.set_window_size(SCREEN_WIDTH, SCREEN_HEIGHT)
driver.get(APP_URL)

capture_overview()
open_patient_view()
capture_patient_view()
capture_introspection_view()
capture_total_band_power()
capture_vacp_panel()

driver.close()
driver.quit()
