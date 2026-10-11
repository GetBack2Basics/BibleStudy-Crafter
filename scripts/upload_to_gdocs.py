import os
import sys
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

SCOPES = [
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/documents'
]

CLIENT_SECRET_FILE = 'c:\\Projects\\BibleStudy-Crafter\\client_secret.json'
TOKEN_FILE = 'c:\\Projects\\BibleStudy-Crafter\\token.json'

def get_credentials():
    creds = None
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            if not os.path.exists(CLIENT_SECRET_FILE):
                print(f"ERROR: {CLIENT_SECRET_FILE} not found.")
                print("Please download your OAuth client secret JSON from Google Cloud Console and place it at:")
                print(CLIENT_SECRET_FILE)
                sys.exit(1)
            flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, 'w') as token:
            token.write(creds.to_json())
    return creds

def upload_docx_as_gdoc(docx_path, title):
    creds = get_credentials()
    drive_service = build('drive', 'v3', credentials=creds)

    file_metadata = {
        'name': title,
        'mimeType': 'application/vnd.google-apps.document'  # Converts to native Google Doc on upload!
    }
    media = MediaFileUpload(
        docx_path,
        mimetype='application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        resumable=True
    )
    
    print(f"Uploading and converting '{docx_path}' to Google Doc...")
    file = drive_service.files().create(
        body=file_metadata,
        media_body=media,
        fields='id, webViewLink, name'
    ).execute()
    
    doc_id = file.get('id')
    doc_link = file.get('webViewLink')
    print(f"\nSUCCESS! Google Doc created:")
    print(f"Title: {file.get('name')}")
    print(f"Link: {doc_link}")
    return doc_link

if __name__ == '__main__':
    docx_file = 'c:\\Projects\\BibleStudy-Crafter\\docs\\BibleStudy_Crafter_Guide.docx'
    doc_title = 'BibleStudy-Crafter: The Complete Guide (ELI10)'
    if len(sys.argv) > 1:
        docx_file = sys.argv[1]
    if len(sys.argv) > 2:
        doc_title = sys.argv[2]
        
    upload_docx_as_gdoc(docx_file, doc_title)
