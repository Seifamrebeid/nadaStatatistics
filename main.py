import pandas as pd
import os
import requests
import re

# ====== CONFIG ======
input_file = r"C:\Users\nadas\OneDrive\Desktop\nadaStatatistics\StudentPicsDataset.xlsx"
output_folder = "طلاب_photos"

os.makedirs(output_folder, exist_ok=True)

# ====== LOAD DATA ======
if input_file.endswith(".csv"):
    df = pd.read_csv(input_file)
else:
    df = pd.read_excel(input_file)

# ====== EXTRACT FILE ID ======
def get_drive_id(url):
    match = re.search(r"id=([^&]+)", url)
    return match.group(1) if match else None

# ====== CLEAN FILE NAME ======
def clean_filename(name):
    name = str(name)
    name = name.strip()
    name = name.replace(" ", "_")
    # remove invalid Windows characters
    name = re.sub(r'[\\/*?:"<>|]', "", name)
    return name

# ====== DOWNLOAD FUNCTION ======
def download_file(file_id, filepath):
    URL = "https://drive.google.com/uc?export=download"

    session = requests.Session()
    response = session.get(URL, params={"id": file_id}, stream=True)

    # Handle Google Drive confirmation (large files)
    for key, value in response.cookies.items():
        if key.startswith("download_warning"):
            response = session.get(URL, params={"id": file_id, "confirm": value}, stream=True)

    with open(filepath, "wb") as f:
        for chunk in response.iter_content(32768):
            if chunk:
                f.write(chunk)

# ====== PROCESS ======
for _, row in df.iterrows():
    student_id = str(row["Student ID"])
    name = clean_filename(row["Student Name"])
    link = str(row["Photo Link"])

    file_id = get_drive_id(link)

    if file_id:
        filename = f"{student_id}_{name}.jpg"
        filepath = os.path.join(output_folder, filename)

        try:
            download_file(file_id, filepath)
            print(f"✅ Downloaded: {filename}")
        except Exception as e:
            print(f"❌ Error downloading {student_id}: {e}")
    else:
        print(f"⚠️ Invalid link for {student_id}")