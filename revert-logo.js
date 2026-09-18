const fs = require('fs');
let code = fs.readFileSync('src/components/ReceiptForm.tsx', 'utf8');

// Remove isCapturing state
code = code.replace(/  const \[isCapturing, setIsCapturing\] = useState\(false\);\n/, '');
code = code.replace(/    setIsCapturing\(true\);\n/g, '');
code = code.replace(/    \} finally \{\n      setIsCapturing\(false\);\n    \}\n/g, '    } catch (error) {\n      console.error("Error capturing receipt:", error);\n      alert("匯出失敗，請稍後再試");\n    }\n');

// Wait, the catch block was:
//       } catch (error) {
//         console.error("Error capturing receipt:", error);
//         alert("匯出失敗，請稍後再試");
//       } finally {
//         setIsCapturing(false);
//       }

// So just replace the finally block
code = code.replace(/      } finally \{\n        setIsCapturing\(false\);\n      \}\n/g, '      }\n');


// Replace the title
const titleRegex = /        <div className="relative flex items-center justify-center mb-6 border-b border-gray-100 pb-4 pt-2">\n          <h2 className="text-\[24px\] font-bold tracking-widest text-\[#18181B\]">領款簽收單<\/h2>\n          \{isCapturing && \(\n            <img \n              src="\/Logo｜Orange\.svg" \n              alt="Logo" \n              className="absolute right-0 top-1\/2 -translate-y-1\/2 w-8 h-8 object-contain"\n              crossOrigin="anonymous"\n            \/>\n          \)\}\n        <\/div>/;

const newTitle = `        <div className="text-center mb-6 border-b border-gray-100 pb-4">
          <h2 className="text-[20px] font-bold tracking-widest text-[#18181B]">領款簽收單</h2>
          <div className="text-[12px] text-gray-500 mt-1">拾壤室內裝修股份有限公司</div>
        </div>`;

code = code.replace(titleRegex, newTitle);

fs.writeFileSync('src/components/ReceiptForm.tsx', code);
console.log('done');
