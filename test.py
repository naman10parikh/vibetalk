#!/usr/bin/env python3
import os
import time
import base64
import json
import io
from datetime import datetime
from PIL import Image
import numpy as np
import Quartz as QZ
import Quartz.CoreGraphics as CG
from openai import OpenAI
import sys

client = OpenAI()

# Create screenshots directory if it doesn't exist
os.makedirs("screenshots", exist_ok=True)

# Define the prompt for extracting information
PROMPT = (
    "This is a screenshot of Cursor IDE with an AI conversation pane. "
    "Locate the AI conversation area and extract EXACTLY two fields in strict JSON format:\n"
    "{ \"user_input\": \"<most recent user question or input>\", \"AI_output\": \"<most recent AI response>\" }\n"
    "If no conversation is visible or the pane is not open, return both fields as empty strings. "
    "Only return the JSON object, no additional text or formatting."
)

# Function to find Cursor IDE windows
def find_cursor_windows():
    """Find all Cursor IDE windows"""
    windows = QZ.CGWindowListCopyWindowInfo(QZ.kCGWindowListOptionAll, QZ.kCGNullWindowID)
    cursor_windows = []
    
    for w in windows:
        owner = w.get("kCGWindowOwnerName") or ""
        title = w.get("kCGWindowName") or ""
        
        # Look for Cursor IDE windows
        if "cursor" in owner.lower() or "cursor" in title.lower():
            cursor_windows.append({
                'owner': owner,
                'title': title,
                'window_id': w["kCGWindowNumber"]
            })
    
    return cursor_windows

# Function to capture Cursor IDE window
def capture_cursor_window():
    """Capture the main Cursor IDE window"""
    cursor_windows = find_cursor_windows()
    
    if not cursor_windows:
        raise RuntimeError("No Cursor IDE windows found. Please make sure Cursor is running.")
    
    # Try windows in z-order (frontmost first) until we successfully grab an image
    main_window = None
    img_ref = None

    for window in cursor_windows:
        w_id = window['window_id']
        img_ref = CG.CGWindowListCreateImage(
            CG.CGRectNull,
            QZ.kCGWindowListOptionIncludingWindow,
            w_id,
            CG.kCGWindowImageBoundsIgnoreFraming,
        )
        if img_ref:
            main_window = window
            break  # we found a capture-able window

    # If none of the windows produced an image, raise error early
    if not main_window or not img_ref:
        raise RuntimeError("Failed to capture window image")

    # Now we already have img_ref of the correct window; proceed to convert it

    print(f"Capturing window: {main_window['owner']} - {main_window['title']}")

    # Convert to PIL Image
    height = CG.CGImageGetHeight(img_ref)
    width = CG.CGImageGetWidth(img_ref)
    rowbytes = CG.CGImageGetBytesPerRow(img_ref)
    data = CG.CGDataProviderCopyData(CG.CGImageGetDataProvider(img_ref))
    arr = np.frombuffer(data, np.uint8).reshape(height, rowbytes // 4, 4)[:, :width, :3]
    img = Image.fromarray(arr)

    # Save as PNG bytes
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return buf.getvalue()

# Function to extract JSON from the image using OpenAI
def extract_conversation_data(img_bytes):
    """Extract conversation data from screenshot using OpenAI Vision API"""
    b64 = base64.b64encode(img_bytes).decode()
    
    try:
        # Replace the placeholder text-only call with a proper multimodal call using the latest Responses API syntax
        response = client.responses.create(
            model="gpt-4.1-mini",  # use mini tier; change to gpt-4.1 for higher accuracy
            text={"format": {"type": "json_object"}},
            input=[
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": PROMPT},
                        {
                            "type": "input_image",
                            "image_url": f"data:image/png;base64,{b64}",
                        },
                    ],
                }
            ],
        )
        
        content = response.output_text or ""
        print(response.output_text)
        # Try to parse JSON from the response
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            # If response is not valid JSON, try to extract JSON from the text
            import re
            json_match = re.search(r'\{.*\}', content, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
            else:
                print(f"Could not parse JSON from response: {content}")
                return {"user_input": "", "AI_output": ""}
                
    except Exception as e:
        print(f"Error calling OpenAI API: {e}")
        return {"user_input": "", "AI_output": ""}

# Main monitoring function
def monitor_cursor_ai():
    """Main function to monitor Cursor IDE AI conversations"""
    print("Starting Cursor IDE AI conversation monitor...")
    print("Press Ctrl+C to stop")
    
    last_conversation = {}
    
    while True:
        try:
            # Capture screenshot
            img_bytes = capture_cursor_window()
            
            # Save screenshot with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            screenshot_path = f"screenshots/cursor_{timestamp}.png"
            
            print(f"Screenshot saved: {screenshot_path}")
            
            # Extract conversation data
            conversation_data = extract_conversation_data(img_bytes)
            
            # Only print if conversation has changed
            if conversation_data != last_conversation:
                print("\n" + "="*50)
                print(f"Conversation Update - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
                print("="*50)
                print(json.dumps(conversation_data, ensure_ascii=False, indent=2))
                print("="*50 + "\n")
                
                last_conversation = conversation_data
            
            # Wait before next capture
            time.sleep(3)  # Check every 3 seconds
            
        except KeyboardInterrupt:
            print("\nStopping monitor...")
            break
        except Exception as e:
            print(f"Error: {e}")
            print("Retrying in 5 seconds...")
            time.sleep(5)

if __name__ == "__main__":
    # Check if Cursor is running
    cursor_windows = find_cursor_windows()
    if not cursor_windows:
        print("Error: Cursor IDE is not running or not found.")
        print("Please start Cursor IDE and try again.")
        sys.exit(1)
    
    monitor_cursor_ai()

