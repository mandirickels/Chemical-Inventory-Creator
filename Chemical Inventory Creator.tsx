import React, { useState } from 'react';
import { Upload, Download, FileSpreadsheet, Camera, Loader2, X, Trash2, Edit2, Save, Plus, Search } from 'lucide-react';
import * as XLSX from 'xlsx';

export default function ChemicalLabelParser() {
  const [images, setImages] = useState([]);
  const [extractedData, setExtractedData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [processingIndex, setProcessingIndex] = useState(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [editingRow, setEditingRow] = useState(null);
  const [editedData, setEditedData] = useState({});
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('cas');
  const [searching, setSearching] = useState(false);
  const [showNotFoundModal, setShowNotFoundModal] = useState(false);
  const [notFoundQuery, setNotFoundQuery] = useState('');

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files);
    const newImages = files.map(file => ({
      file,
      preview: URL.createObjectURL(file),
      id: Date.now() + Math.random(),
      extracted: false
    }));
    setImages(prev => [...prev, ...newImages]);
  };

  const removeImage = (id) => {
    setImages(prev => prev.filter(img => img.id !== id));
    setExtractedData(prev => prev.filter(data => data.imageId !== id));
  };

  const extractDataFromImage = async (image, index) => {
    setProcessingIndex(index);
    try {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64Image = reader.result.split(',')[1];
        
        const prompt = customPrompt || 
          `Please analyze this image of a chemical or product label and extract key information.
          Focus on identifying:
          - Chemical/Product Name (the primary name on the label)
          - CAS Number (if present)
          - Formula (chemical formula if present)
          - Concentration/Strength (if applicable)
          - Lot/Batch Number (if present)
          - Manufacturer (if visible)
          - Any other relevant identifiers
          
          Return the data as a JSON object containing all the information found.
          Format: {"Chemical Name": "...", "CAS Number": "...", "Formula": "...", "Concentration": "...", "Lot Number": "...", "Manufacturer": "..."}
          Only include fields where information is found. Only return valid JSON, no other text.`;

        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 1000,
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'image',
                    source: {
                      type: 'base64',
                      media_type: image.file.type,
                      data: base64Image,
                    },
                  },
                  {
                    type: 'text',
                    text: prompt,
                  },
                ],
              },
            ],
          }),
        });

        const data = await response.json();
        const textContent = data.content
          .filter((item) => item.type === 'text')
          .map((item) => item.text)
          .join('\n');

        const jsonMatch = textContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsedData = JSON.parse(jsonMatch[0]);
          setExtractedData(prev => [...prev, { ...parsedData, imageId: image.id }]);
          setImages(prev => prev.map(img => 
            img.id === image.id ? { ...img, extracted: true } : img
          ));
        } else {
          throw new Error('Could not parse JSON from response');
        }
      };
      reader.readAsDataURL(image.file);
    } catch (error) {
      console.error('Error extracting data:', error);
      alert(`Error extracting data from image ${index + 1}. Please try again.`);
    }
  };

  const extractAllData = async () => {
    if (images.length === 0) return;

    setLoading(true);
    setExtractedData([]);
    
    for (let i = 0; i < images.length; i++) {
      await extractDataFromImage(images[i], i);
    }
    
    setLoading(false);
    setProcessingIndex(null);
  };

  const downloadExcel = () => {
    if (extractedData.length === 0) return;

    const cleanedData = extractedData.map(({ imageId, ...rest }) => rest);
    
    const worksheet = XLSX.utils.json_to_sheet(cleanedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Chemical Data');
    XLSX.writeFile(workbook, 'chemical_labels_data.xlsx');
  };

  const clearAll = () => {
    setImages([]);
    setExtractedData([]);
    setProcessingIndex(null);
  };

  const removeExtractedItem = (index) => {
    setExtractedData(prev => prev.filter((_, idx) => idx !== index));
  };

  const startEditing = (index, row) => {
    setEditingRow(index);
    setEditedData({ ...row });
  };

  const saveEdit = (index) => {
    setExtractedData(prev => prev.map((item, idx) => 
      idx === index ? editedData : item
    ));
    setEditingRow(null);
    setEditedData({});
  };

  const cancelEdit = () => {
    setEditingRow(null);
    setEditedData({});
  };

  const handleEditChange = (column, value) => {
    setEditedData(prev => ({ ...prev, [column]: value }));
  };

  const addBlankEntry = () => {
    const newEntry = {
      "Chemical Name": "",
      "CAS Number": "",
      "Formula": "",
      "Concentration": "",
      "Lot Number": "",
      "Manufacturer": ""
    };
    setExtractedData(prev => [...prev, newEntry]);
    setShowAddModal(false);
    setSearchQuery('');
  };

  const addManualEntry = () => {
    const newEntry = {
      "Chemical Name": notFoundQuery || "",
      "CAS Number": "",
      "Formula": "",
      "Concentration": "",
      "Lot Number": "",
      "Manufacturer": ""
    };
    setExtractedData(prev => [...prev, newEntry]);
    setShowNotFoundModal(false);
    setNotFoundQuery('');
    setSearchQuery('');
  };

  const searchChemical = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const prompt = searchType === 'cas' 
        ? `Look up the chemical with CAS number: ${searchQuery}. Provide the following information in JSON format: {"Chemical Name": "...", "CAS Number": "${searchQuery}", "Formula": "...", "Molecular Weight": "...", "Common Uses": "..."}. Only return valid JSON, no other text.`
        : `Look up the chemical: ${searchQuery}. Provide the following information in JSON format: {"Chemical Name": "${searchQuery}", "CAS Number": "...", "Formula": "...", "Molecular Weight": "...", "Common Uses": "..."}. Only return valid JSON, no other text.`;

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [
            {
              role: 'user',
              content: prompt,
            },
          ],
        }),
      });

      const data = await response.json();
      const textContent = data.content
        .filter((item) => item.type === 'text')
        .map((item) => item.text)
        .join('\n');

      const jsonMatch = textContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsedData = JSON.parse(jsonMatch[0]);
        setExtractedData(prev => [...prev, parsedData]);
        setShowAddModal(false);
        setSearchQuery('');
      } else {
        throw new Error('Could not parse chemical data');
      }
    } catch (error) {
      console.error('Error searching chemical:', error);
      alert('Chemical not found. Item must be manually added to inventory. Please check the CAS number or chemical name and try again, or add the information manually by editing the table after closing this dialog.');
    } finally {
      setSearching(false);
    }
  };

  const getAllColumns = () => {
    const columns = new Set();
    extractedData.forEach(row => {
      Object.keys(row).forEach(key => {
        if (key !== 'imageId') columns.add(key);
      });
    });
    return Array.from(columns);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center justify-center gap-3">
            <FileSpreadsheet className="w-10 h-10 text-indigo-600" />
            Chemical Label Parser
          </h1>
          <p className="text-gray-600">Extract chemical information from multiple labels to Excel</p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Upload Section */}
          <div className="lg:col-span-1 bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">Upload Labels</h2>
              {images.length > 0 && (
                <button
                  onClick={clearAll}
                  className="text-red-600 hover:text-red-700 text-sm flex items-center gap-1"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear All
                </button>
              )}
            </div>
            
            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-indigo-500 transition-colors mb-4">
              <div className="flex flex-col items-center justify-center">
                <Upload className="w-8 h-8 text-gray-400 mb-2" />
                <p className="text-sm text-gray-500">Click to upload labels</p>
                <p className="text-xs text-gray-400 mt-1">Multiple images supported</p>
              </div>
              <input type="file" className="hidden" accept="image/*" multiple onChange={handleImageUpload} />
            </label>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {images.map((image, idx) => (
                <div key={image.id} className="flex items-center gap-2 p-2 border rounded-lg bg-gray-50">
                  <img src={image.preview} alt={`Label ${idx + 1}`} className="w-16 h-16 object-cover rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-700 truncate">Label {idx + 1}</p>
                    <p className="text-xs text-gray-500">
                      {image.extracted ? (
                        <span className="text-green-600">✓ Extracted</span>
                      ) : processingIndex === idx ? (
                        <span className="text-blue-600">Processing...</span>
                      ) : (
                        'Pending'
                      )}
                    </p>
                  </div>
                  <button
                    onClick={() => removeImage(image.id)}
                    className="text-gray-400 hover:text-red-600"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Custom Instructions (Optional)
              </label>
              <textarea
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                rows="3"
                placeholder="e.g., 'Also include expiration date and safety codes'"
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
              />
            </div>

            <button
              onClick={extractAllData}
              disabled={images.length === 0 || loading}
              className="w-full mt-4 bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing {processingIndex !== null ? `${processingIndex + 1}/${images.length}` : '...'}
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  Extract All ({images.length})
                </>
              )}
            </button>
          </div>

          {/* Results Section */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-gray-800">
                Extracted Data ({extractedData.length} entries)
              </h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 flex items-center gap-2 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                  Add Chemical
                </button>
                {extractedData.length > 0 && (
                  <button
                    onClick={downloadExcel}
                    className="bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 flex items-center gap-2 transition-colors"
                  >
                    <Download className="w-5 h-5" />
                    Download Excel
                  </button>
                )}
              </div>
            </div>
            
            {extractedData.length > 0 ? (
              <div className="overflow-auto max-h-[600px] border border-gray-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left font-semibold text-gray-700 border-b">#</th>
                      {getAllColumns().map((col) => (
                        <th key={col} className="px-4 py-2 text-left font-semibold text-gray-700 border-b whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                      <th className="px-4 py-2 text-center font-semibold text-gray-700 border-b">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {extractedData.map((row, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-2 border-b text-gray-500 font-medium">{idx + 1}</td>
                        {getAllColumns().map((col) => (
                          <td key={col} className="px-4 py-2 border-b text-gray-600">
                            {editingRow === idx ? (
                              <input
                                type="text"
                                value={editedData[col] || ''}
                                onChange={(e) => handleEditChange(col, e.target.value)}
                                className="w-full px-2 py-1 border border-gray-300 rounded focus:ring-2 focus:ring-indigo-500"
                              />
                            ) : (
                              row[col] || '-'
                            )}
                          </td>
                        ))}
                        <td className="px-4 py-2 border-b text-center">
                          <div className="flex justify-center gap-2">
                            {editingRow === idx ? (
                              <>
                                <button
                                  onClick={() => saveEdit(idx)}
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50 p-1 rounded transition-colors"
                                  title="Save changes"
                                >
                                  <Save className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={cancelEdit}
                                  className="text-gray-600 hover:text-gray-700 hover:bg-gray-100 p-1 rounded transition-colors"
                                  title="Cancel"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </>
                            ) : (
                              <>
                                <button
                                  onClick={() => startEditing(idx, row)}
                                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 p-1 rounded transition-colors"
                                  title="Edit this entry"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => removeExtractedItem(idx)}
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 p-1 rounded transition-colors"
                                  title="Delete this entry"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-96 text-gray-400">
                <FileSpreadsheet className="w-16 h-16 mb-3" />
                <p>No data extracted yet</p>
                <p className="text-sm mt-1">Upload label images and click "Extract All"</p>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 bg-white rounded-lg shadow-lg p-6">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">How to Use</h3>
          <ol className="list-decimal list-inside space-y-2 text-gray-600">
            <li>Upload multiple photos of chemical or product labels at once</li>
            <li>Review the uploaded images in the left panel</li>
            <li>Click "Extract All" to process all labels with AI</li>
            <li>Edit any extracted data by clicking the edit icon next to an entry</li>
            <li>Add chemicals manually by clicking "Add Chemical" and searching by CAS number or name</li>
            <li>Remove unwanted entries with the trash icon</li>
            <li>Download as a single Excel file containing all entries</li>
          </ol>
          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-gray-700">
              <strong>Tip:</strong> You can edit any field in the table, add chemicals manually by searching, and organize your data before downloading.
            </p>
          </div>
        </div>
      </div>

      {/* Add Chemical Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800">Add Chemical</h3>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  setSearchQuery('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search By
              </label>
              <div className="flex gap-4 mb-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="cas"
                    checked={searchType === 'cas'}
                    onChange={(e) => setSearchType(e.target.value)}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">CAS Number</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    value="name"
                    checked={searchType === 'name'}
                    onChange={(e) => setSearchType(e.target.value)}
                    className="mr-2"
                  />
                  <span className="text-sm text-gray-700">Chemical Name</span>
                </label>
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && searchChemical()}
                  placeholder={searchType === 'cas' ? 'e.g., 64-17-5' : 'e.g., Ethanol'}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
            </div>

            <button
              onClick={searchChemical}
              disabled={!searchQuery.trim() || searching}
              className="w-full bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors mb-3"
            >
              {searching ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-5 h-5" />
                  Search & Add
                </>
              )}
            </button>

            <button
              onClick={addBlankEntry}
              className="w-full bg-gray-600 text-white py-3 rounded-lg font-medium hover:bg-gray-700 flex items-center justify-center gap-2 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Manual Add Chemical
            </button>
          </div>
        </div>
      )}

      {/* Not Found Modal */}
      {showNotFoundModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold text-gray-800">Chemical Not Found</h3>
              <button
                onClick={() => {
                  setShowNotFoundModal(false);
                  setNotFoundQuery('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <p className="text-gray-600 mb-6">
              Could not find information for "{notFoundQuery}". Would you like to manually add this item to the inventory?
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowNotFoundModal(false);
                  setNotFoundQuery('');
                }}
                className="flex-1 bg-gray-200 text-gray-800 py-3 rounded-lg font-medium hover:bg-gray-300 transition-colors"
              >
                Exit
              </button>
              <button
                onClick={addManualEntry}
                className="flex-1 bg-indigo-600 text-white py-3 rounded-lg font-medium hover:bg-indigo-700 flex items-center justify-center gap-2 transition-colors"
              >
                <Plus className="w-5 h-5" />
                Manually Add
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}