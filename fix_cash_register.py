import sys

def process_file():
    filepath = 'apps/web/src/components/phone/CashRegister.tsx'
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Find the phone__body div
    target_start = '<div className="phone__body" style={{ position: \'relative\', paddingBottom: \'150px\', overflowY: \'auto\' }}>'
    replacement_start = '<div className="phone__body" style={{ position: \'relative\', display: \'flex\', flexDirection: \'column\', height: \'100%\', overflow: \'hidden\' }}>\n      <div style={{ flex: 1, overflowY: \'auto\', paddingBottom: \'140px\' }}>'
    
    if target_start in content:
        content = content.replace(target_start, replacement_start, 1)
    else:
        print("Target start not found")
        sys.exit(1)

    # Find the section cash-totals
    target_end = '      <section className="cash-totals"'
    replacement_end = '      </div>\n\n      <section className="cash-totals"'
    
    if target_end in content:
        content = content.replace(target_end, replacement_end, 1)
    else:
        print("Target end not found")
        sys.exit(1)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

process_file()
print("Success")
