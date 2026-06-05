const { google } = require('googleapis');

async function main() {
  const credentials = {
    client_email: 'sensesoil-sheets-bot@sensesoil-hunting-app.iam.gserviceaccount.com',
    private_key: "-----BEGIN PRIVATE KEY-----\nMIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDqD14T1eZji/RP\njrt4IKOIE8REqAElPx2/rjy+Wcbs9z/2GksZwjFB9E1FBuqRE3NvC0GhVQ8JQL72\nbA10WXZ86uoc084bTZrCJ8yAMb2cjYvrr7cSmscrj0Ts3sxjJqi2GYd3CsPCIy+s\nmR6I8fOv6x+fuhKZh+94Iql0gLgluI4MGeMtDk2PpBniQR+FqBlJBZ4rck9Z/uDp\nbFRM6gT/HPZXxH+2JsPKPwHlzzSwCLA1cRU8wezSOODOCRUFlZxKgmRpj0uuXrHB\nBFfz5mpbZNlb9uQw5qh+HwbbyyPMGBVgq89gomm9od4CBAxkb0ASQHClLz7ZguKP\nDkJreTB1AgMBAAECggEADbMwkoCmp5T9i9qS5okiiUh+6HXc+00idKHCNHIUzrH6\nMHGBi9RuBapDC5NID43P5+QEx2ivJJ+BjfLtJq5F3THy2hUbr0VvlYW21poSuyMd\n2YHDeXdNySLtqd+wnu0YWvBLmZArvSVKGRQtUV64IMfmZfcCN7JZNfLxcDxIiwyR\nu8dGkHwDXEG7M73dwSp0LC+OJhDvdQgCjOFtksafmv7fN0/SdLHw5//tZuvdK9bq\nFmZ5dLVyuRS2d90O+EQxnH8lRSej5iMo1VmkjFA7VEMPn2z0LKAQWjbT5Jpim6zZ\nG4uayzxS8E0JKqIj04CFjbgqZMFI0eZPydHj7EerAQKBgQD23CoCTwZhEMTIMmz0\nbIJ1GH7mfoPymj5kZShU8OZygi0pLHZTYKQOc2FliyJLnduZUjdLxc3zun/5GX/0\ncc9tIvrbn0RQTpFAUJ1eSGl834rfWJ6bk3Et//RnN65mbQyrdtHM6A41lNmZ5c4j\nf9KtdZQxumL1+lcbrv4RvMch0QKBgQDyueFOmPy49Q5WZL762IhSVAxNDm1Tiqpb\nn37UGcxsNPaYKxpEl2tglpwdod18+mmOqHXb8DgU8/1F5fO3UAao1cs4a3d9yqSr\nVQI13mwiTk+0+bJFTm1np5j/gyBDPXIinOyKKAU+QvHPvo8sDbKonm09QQrpXCi6\nUe/GBtCJZQKBgHDoXBJ4QIuu1sJWRf05kCWskYYtAX65y6WxmtPW5yAiqDM30drq\nzb6KSVbfX01Eo0cqEn6Gt18twxCU+DA+yce6AxDmdKFifg7zkDaqWg0yVVs4Njsk\nIdUPR6LaFdtlLzFRhD37OVyKe0hnknQsJ5kMuT5RaKfm22afEDfepxmxAoGAFkrS\nEYjldQs0pOSd0aX/ZyhG9PDFQ63xlXahjFNOPgXjO/iBchlCCF3sup/6GpdZCHwa\nTvfR/sKl2TyUVJqp8emov2bHU6s/0mh9SntCDSiKE4H3SHw6ehGfcKAXX3WOPPWS\nl+GzEZPOZ5kFxzL+3JOoTr7hhKstJmeOEO7hSi0CgYB6txrO2PvHbudgnllp80JK\nKJx4HdYOKwguR/hQ3JadADBVNjqjPi29Md3bzuZfUBqq1IpIix1q7Dg5kK3BxfKa\nGqoCQ4rxPMEg7cfZUWORECZKzVopFWZV/dZgrp4axzgeftGqN3rPgsnsIu/hvtQI\nWY8lfoWCIECFf934fHEBwQ==\n-----END PRIVATE KEY-----\n"
  };

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });

  const sheets = google.sheets({ version: 'v4', auth });
  
  const id1 = '1bYwZNqQLU-jgmJvz3tB_195QB4uZwqWOVPDI-c4_Pm4';
  const id2 = '1uRnOIQ3vhINawQYGJFq4alHlS2uTKatn41NIM_reMGE';

  try {
    const res = await sheets.spreadsheets.values.get({ spreadsheetId: id1, range: 'Award!A1:BA20' });
    console.log("Award sheet rows:");
    res.data.values.forEach((r, i) => console.log(`Row ${i+1}:`, r.join(' | ')));
  } catch (e) {
    console.log("Error", e.message);
  }
}

main();
