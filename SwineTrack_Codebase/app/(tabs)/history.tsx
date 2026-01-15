import React, { useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  StatusBar,
  TouchableOpacity,
  Dimensions,
  Image,
  ActivityIndicator,
  FlatList,
  Modal,
  Alert,
  Platform
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { supabase } from "@/lib/supabase";
import { fetchReadings, ReadingRow } from "@/features/readings/api";
import { DEVICE_ID } from "@/constants";

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import DateTimePicker from '@react-native-community/datetimepicker';

import {
  TourGuideProvider,
  TourGuideZone,
  TourGuideZoneByPosition,
  useTourGuideController,
} from "rn-tourguide";

const screenWidth = Dimensions.get("window").width;
const PAGE_SIZE = 10;

type ExportRange = 'today' | 'yesterday' | 'this_month' | 'custom';

function HistoryScreenContent() {
  const { canStart, start, stop, eventEmitter } = useTourGuideController();

  const [userName, setUserName] = useState<string | null>(null);
  const [readings, setReadings] = useState<ReadingRow[]>([]);
   
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<string | null>(null);
   
  const [exportModalVisible, setExportModalVisible] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  const [showCustomPickerUI, setShowCustomPickerUI] = useState(false);
  const [customStartDate, setCustomStartDate] = useState(new Date());
  const [customEndDate, setCustomEndDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState<'start' | 'end' | null>(null);

  const deviceId = DEVICE_ID;
  const THEME_COLOR = "#487307";

  const loadReadings = async (pageNumber: number, shouldRefresh = false) => {
    try {
      if (shouldRefresh) setLoading(true);
      else setLoadingMore(true);
      setError(null);

      const toDate = new Date();
      const fromDate = new Date();
      fromDate.setDate(fromDate.getDate() - 7); 

      const offset = pageNumber * PAGE_SIZE;

      const data = await fetchReadings(
        deviceId,
        fromDate.toISOString(),
        toDate.toISOString(),
        PAGE_SIZE,
        offset
      );

      if (shouldRefresh) {
        setReadings(data || []);
      } else {
        setReadings((prev) => [...prev, ...(data || [])]);
      }

      if (!data || data.length < PAGE_SIZE) {
        setHasMore(false);
      } else {
        setHasMore(true);
      }
    } catch (err) {
      console.error("Error fetching readings:", err);
      setError(err instanceof Error ? err.message : "Failed to load readings");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    loadReadings(0, true);
  }, [deviceId]);

  const handleLoadMore = () => {
    if (!loadingMore && !loading && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      loadReadings(nextPage, false);
    }
  };

  const handleRefresh = () => {
    setPage(0);
    setHasMore(true);
    loadReadings(0, true);
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString("en-US", { 
      month: "2-digit", 
      day: "2-digit", 
      year: "2-digit",
      timeZone: "Asia/Manila",
    });
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString("en-US", { 
      hour: "2-digit", 
      minute: "2-digit", 
      hour12: true,
      timeZone: "Asia/Manila",
    });
  };

  const handleExportPress = () => {
    setShowCustomPickerUI(false);
    setCustomStartDate(new Date());
    setCustomEndDate(new Date());
    setExportModalVisible(true);
  };

  const onDateChange = (event: any, selectedDate?: Date) => {
    const currentMode = showDatePicker;
    setShowDatePicker(null); 

    if (selectedDate && currentMode) {
      if (currentMode === 'start') {
        setCustomStartDate(selectedDate);
      } else {
        setCustomEndDate(selectedDate);
      }
    }
  };

  const generatePDF = async (rangeType: ExportRange) => {
    setExportModalVisible(false);
    setIsGeneratingPdf(true);

    try {
      let fromDate = new Date();
      let toDate = new Date();
      let periodText = "";

      if (rangeType === 'today') {
        fromDate.setHours(0, 0, 0, 0);
        periodText = "Today";
      } else if (rangeType === 'yesterday') {
        fromDate.setDate(fromDate.getDate() - 1);
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date(fromDate);
        toDate.setHours(23, 59, 59, 999);
        periodText = "Yesterday";
      } else if (rangeType === 'this_month') {
        fromDate.setDate(1); 
        fromDate.setHours(0, 0, 0, 0);
        const monthName = fromDate.toLocaleString('default', { month: 'long', year: 'numeric' });
        periodText = `This Month (${monthName})`;
      } else if (rangeType === 'custom') {
        fromDate = new Date(customStartDate);
        fromDate.setHours(0, 0, 0, 0);
        toDate = new Date(customEndDate);
        toDate.setHours(23, 59, 59, 999); 
        periodText = `${formatDate(fromDate.toISOString())} - ${formatDate(toDate.toISOString())}`;
      }

      const { data, error } = await supabase
        .from("readings")
        .select("*")
        .eq("device_id", deviceId)
        .gte("ts", fromDate.toISOString())
        .lte("ts", toDate.toISOString())
        .order("ts", { ascending: false }) 
        .limit(15000); 

      if (error) throw error;
      
      if (!data || data.length === 0) {
        Alert.alert("No Data", `No records found for ${periodText}.`);
        setIsGeneratingPdf(false);
        return;
      }

      const tableRows = data.map(item => `
        <tr>
          <td>${formatDate(item.ts)}</td>
          <td>${formatTime(item.ts)}</td>
          <td>${item.temp_c?.toFixed(2) ?? '-'}</td>
          <td>${item.humidity_rh?.toFixed(1) ?? '-'}</td>
          <td>${item.gas_res_ohm ? (item.gas_res_ohm / 1000).toFixed(1) + " kΩ" : '-'}</td>
        </tr>
      `).join('');

      const htmlContent = `
        <html>
          <head>
            <style>
              body { font-family: 'Helvetica', sans-serif; padding: 20px; }
              h1 { color: #487307; text-align: center; }
              p { text-align: center; color: #666; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; margin-top: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: center; font-size: 10px; }
              th { background-color: #487307; color: white; }
              tr:nth-child(even) { background-color: #f2f2f2; }
            </style>
          </head>
          <body>
            <h1>SwineTrack History Report</h1>
            <p>Exported on: ${new Date().toLocaleString()}</p>
            <p>Period: ${periodText}</p>
            <p style="text-align: right; font-size: 10px; color: #888;">Total Records: ${data.length}</p>
            <table>
              <tr>
                <th>Date</th>
                <th>Time</th>
                <th>Temp (°C)</th>
                <th>Humidity (%)</th>
                <th>Ammonia (kΩ)</th>
              </tr>
              ${tableRows}
            </table>
          </body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html: htmlContent });
      await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf', dialogTitle: 'Save History Report' });

    } catch (err) {
      console.error("Export failed:", err);
      const message = err instanceof Error ? err.message : "Request timed out or no data.";
      Alert.alert("Export Failed", message);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const renderItem = ({ item }: { item: ReadingRow }) => (
    <View style={styles.tableRow}>
      <Text style={styles.cell}>{formatDate(item.ts)}</Text>
      <Text style={styles.cell}>{formatTime(item.ts)}</Text>
      <Text style={styles.cell}>{item.temp_c?.toFixed(2) || "N/A"}</Text>
      <Text style={styles.cell}>{item.humidity_rh?.toFixed(1) || "N/A"}</Text>
      <Text style={styles.cell}>
        {item.gas_res_ohm ? (item.gas_res_ohm / 1000).toFixed(1) + " kΩ" : "N/A"}
      </Text>
    </View>
  );

  const renderFooter = () => {
    if (!loadingMore) return <View style={{ height: 20 }} />;
    return (
      <View style={styles.footerContainer}>
        <ActivityIndicator size="small" color="#487307" />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />

      <Modal
        animationType="fade"
        transparent={true}
        visible={exportModalVisible}
        onRequestClose={() => setExportModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            
            {!showCustomPickerUI ? (
              <>
                <Text style={styles.modalTitle}>Select Export Period</Text>
                <Text style={styles.modalSubtitle}>Choose a range to generate PDF:</Text>

                <TouchableOpacity style={styles.modalButton} onPress={() => generatePDF('today')}>
                  <Text style={styles.modalButtonText}>Today</Text> 
                </TouchableOpacity>

                <TouchableOpacity style={styles.modalButton} onPress={() => generatePDF('yesterday')}>
                  <Text style={styles.modalButtonText}>Yesterday</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.modalButton} onPress={() => generatePDF('this_month')}>
                  <Text style={styles.modalButtonText}>This Month</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.modalButton} onPress={() => setShowCustomPickerUI(true)}>
                  <Text style={styles.modalButtonText}>Custom Range...</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.modalButton, styles.cancelButton]} 
                  onPress={() => setExportModalVisible(false)}
                >
                  <Text style={[styles.modalButtonText, styles.cancelButtonText]}>Cancel</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Custom Range</Text>
                <Text style={styles.modalSubtitle}>Select start and end dates:</Text>

                <View style={styles.datePickerRow}>
                  <Text style={styles.dateLabel}>Start:</Text>
                  {Platform.OS === 'android' ? (
                    <TouchableOpacity onPress={() => setShowDatePicker('start')} style={styles.dateDisplayBox}>
                      <Text>{formatDate(customStartDate.toISOString())}</Text>
                    </TouchableOpacity>
                  ) : (
                    <DateTimePicker
                      value={customStartDate}
                      mode="date"
                      display="default"
                      onChange={(e, date) => date && setCustomStartDate(date)}
                      maximumDate={new Date()}
                      style={{ width: 100 }}
                      accentColor={THEME_COLOR}
                    />
                  )}
                </View>

                <View style={styles.datePickerRow}>
                  <Text style={styles.dateLabel}>End:</Text>
                  {Platform.OS === 'android' ? (
                    <TouchableOpacity onPress={() => setShowDatePicker('end')} style={styles.dateDisplayBox}>
                      <Text>{formatDate(customEndDate.toISOString())}</Text>
                    </TouchableOpacity>
                  ) : (
                    <DateTimePicker
                      value={customEndDate}
                      mode="date"
                      display="default"
                      onChange={(e, date) => date && setCustomEndDate(date)}
                      maximumDate={new Date()}
                      style={{ width: 100 }}
                      accentColor={THEME_COLOR}
                    />
                  )}
                </View>

                {showDatePicker && (
                  <DateTimePicker
                    value={showDatePicker === 'start' ? customStartDate : customEndDate}
                    mode="date"
                    display="default"
                    onChange={onDateChange}
                    maximumDate={new Date()}
                    accentColor={THEME_COLOR}
                  />
                )}

                <TouchableOpacity 
                  style={[styles.modalButton, { backgroundColor: '#487307', marginTop: 15, borderBottomWidth:0, borderRadius:8 }]} 
                  onPress={() => generatePDF('custom')}
                >
                  <Text style={[styles.modalButtonText, { color: 'white', fontWeight: 'bold' }]}>Download PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.modalButton, styles.cancelButton]} 
                  onPress={() => setShowCustomPickerUI(false)}
                >
                  <Text style={styles.modalButtonText}>Back</Text>
                </TouchableOpacity>
              </>
            )}

          </View>
        </View>
      </Modal>

      {isGeneratingPdf && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#487307" />
            <Text style={styles.loadingOverlayText}>Generating PDF...</Text>
          </View>
        </View>
      )}

      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <View style={{ width: 60, height: 55 }}>
              <Image source={require("../../assets/images/swinetrack-logo.png")} style={{ width: '100%', height: '100%', resizeMode: 'contain' }} />
          </View>

          <TourGuideZone
            zone={3}
            text="Tap this button anytime to replay this tutorial."
            borderRadius={20}
          >
            <TouchableOpacity onPress={() => start()}>
              <Ionicons name="information-circle-outline" size={28} color="white" style={{ opacity: 0.9 }} />
            </TouchableOpacity>
          </TourGuideZone>
        </View>

        <Text style={styles.welcomeText}>History</Text>
        <Text style={styles.subText}>View your pig&apos;s status history here.</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.titleRow}>
        <Text style={styles.historyTitle}>Recent Logs</Text>
        
        <TourGuideZone
          zone={2}
          text="Tap here to export your logs to a PDF report."
          borderRadius={6}
          style={{ justifyContent: 'center' }}
        >
          <TouchableOpacity
            style={styles.exportButton}
            onPress={handleExportPress}
            disabled={loading || isGeneratingPdf}
          >
            <Ionicons name="document-outline" size={16} color="#4A7C2F" />
            <Text style={styles.exportText}>Export</Text>
          </TouchableOpacity>
        </TourGuideZone>
      </View>


      <TourGuideZone
        zone={1}
        text="View detailed logs of Temperature, Humidity, and Ammonia levels here. Scroll down for more."
        borderRadius={4}
        style={{ flex: 1, marginHorizontal: 10 }}
      >
        <View style={{ flex: 1 }}>
          <View style={styles.tableHeader}>
            <Text style={styles.tableHeaderText}>Date</Text>
            <Text style={styles.tableHeaderText}>Time</Text>
            <Text style={styles.tableHeaderText}>Temp.</Text>
            <Text style={styles.tableHeaderText}>Humidity</Text>
            <Text style={styles.tableHeaderText}>Ammonia</Text>
          </View>

          {loading && page === 0 ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#487307" />
              <Text style={styles.loadingText}>Loading history...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorContainer}>
              <Ionicons name="alert-circle-outline" size={48} color="#ff6b6b" />
              <Text style={styles.errorText}>Error loading data</Text>
              <Text style={styles.errorSubText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={() => loadReadings(0, true)}>
                <Text style={styles.retryText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : readings.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="time-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>No data available</Text>
              <Text style={styles.emptySubText}>No readings found for the selected period</Text>
            </View>
          ) : (
            <FlatList
              data={readings}
              renderItem={renderItem}
              keyExtractor={(item, index) => `${item.id}-${index}`}
             contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListFooterComponent={renderFooter}
              refreshing={loading}
              onRefresh={handleRefresh}
            />
          )}
        </View>
      </TourGuideZone>
    </View>
  );
}

export default function HistoryScreen() {
  return (
    <TourGuideProvider
      androidStatusBarVisible={true}
      backdropColor="rgba(0, 0, 0, 0.7)"
      borderRadius={10}
      tooltipStyle={{ borderRadius: 12, paddingTop: 15 }}
      preventOutsideInteraction={true} 
    >
      <HistoryScreenContent />
    </TourGuideProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
   
  header: {
    backgroundColor: "#487307",
    paddingTop: 30,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    marginBottom: 20,
  },
  welcomeText: { fontSize: 25, fontWeight: "bold", color: "#fff", marginTop: 2, marginLeft: 15 },
  subText: { fontSize: 14, color: "#d8f2c1", marginTop: 4, marginLeft: 15 },
  divider: { height: 1, backgroundColor: "#fff", marginTop: 12, opacity: 0.5 },
   
  titleRow: { 
    flexDirection: "row", 
    alignItems: "center", 
    justifyContent: "space-between",
    paddingHorizontal: 20, 
    marginBottom: 12, 
    height: 40 
  },
  exportButton: { 
    flexDirection: "row", 
    alignItems: "center", 
    backgroundColor: "#eaf3e3", 
    paddingVertical: 6, 
    paddingHorizontal: 10, 
    borderRadius: 6
  },
  exportText: { marginLeft: 4, color: "#487307", fontWeight: "600", fontSize: 12 },
  historyTitle: { fontSize: 20, fontWeight: "bold", color: "#333" },

  tableHeader: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 10, paddingHorizontal: 4, borderRadius: 4, borderBottomWidth: 2, borderColor: "#eee", marginBottom: 5 },
  tableHeaderText: { fontWeight: "bold", fontSize: 12, width: "20%", textAlign: "center" },
  tableRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderColor: "#f5f5f5" },
  cell: { width: "20%", fontSize: 12, textAlign: "center", color: "#333" },
   
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  loadingText: { marginTop: 10, color: "#666" },
  errorContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  errorText: { fontSize: 18, color: "#ff6b6b", marginTop: 10 },
  errorSubText: { fontSize: 14, color: "#666", textAlign: "center", marginTop: 5 },
  retryButton: { marginTop: 15, backgroundColor: "#487307", paddingVertical: 10, paddingHorizontal: 20, borderRadius: 5 },
  retryText: { color: "white", fontWeight: "600" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  emptyText: { fontSize: 18, color: "#ccc", marginTop: 10 },
  emptySubText: { fontSize: 14, color: "#999", textAlign: "center", marginTop: 5 },
  footerContainer: { paddingVertical: 20, alignItems: "center", justifyContent: "center" },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#487307', marginBottom: 5 },
  modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 20 },
  modalButton: {
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    alignItems: 'center',
  },
  modalButtonText: { fontSize: 16, color: '#333' },
  cancelButton: { borderBottomWidth: 0, marginTop: 10, backgroundColor: '#f9f9f9', borderRadius: 8 },
  cancelButtonText: { color: 'red', fontWeight: 'bold' },

  datePickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 15,
  },
  dateLabel: { fontSize: 16, color: '#333', fontWeight: '600' },
  dateDisplayBox: {
    padding: 10,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    minWidth: 120,
    alignItems: 'center'
  },

  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  loadingBox: { padding: 20, backgroundColor: 'white', borderRadius: 10, elevation: 5, alignItems: 'center' },
  loadingOverlayText: { marginTop: 10, fontSize: 16, fontWeight: '600', color: '#487307' },
});
