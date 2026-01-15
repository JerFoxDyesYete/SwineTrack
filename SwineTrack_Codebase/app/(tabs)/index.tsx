import { useRouter } from "expo-router";
import { LineChart } from "react-native-gifted-charts";
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';

import React, { useState, useEffect, useCallback, memo } from "react";
import {
    Image,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
    ActivityIndicator,
    RefreshControl,
    StyleSheet,
    FlatList,
    ListRenderItem,
    Platform
} from "react-native";
import { supabase } from "@/lib/supabase";
import { useThermalSSE } from "@/features/live/useThermalSSE";
import { useSnapshots } from "@/features/snapshots/useSnapshots";
import { ThermalImage } from "@/components/ThermalImage";
import { DEVICE_ID } from "@/constants";
import { fetchReadings, ReadingRow } from "@/features/readings/api";
import { useKeepAwake } from 'expo-keep-awake';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { TourGuideProvider, TourGuideZone, useTourGuideController } from "rn-tourguide";

const STREAM_URL = "http://192.168.1.102:8787/thermal-stream";
const OPTICAL_URL = "http://192.168.1.103:81/stream";

type LiveStreamProps = {
    streamUrl: string;
    onLoadStart?: () => React.ReactElement;
    onError?: () => void;
};

const LiveStreamView = React.memo(({ streamUrl, onLoadStart, onError }: LiveStreamProps) => {
    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<style>
  body { margin: 0; padding: 0; background-color: #000; height: 10vh; width: 10vw; display: flex; justify-content: center; align-items: center; overflow: hidden; }
  img { position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: contain; }
</style>
</head>
<body>
<script>
  function sendLog(type, msg) { window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, message: msg })); }
</script>
<img src="${streamUrl}" onload="if(this.naturalWidth > 0) { sendLog('SUCCESS', 'Image loaded'); } else { sendLog('WARN', 'Image loaded 0'); }" onerror="sendLog('IMG_ERROR', 'Image failed')" />
</body>
</html>
`;
    return (
        <View style={{ flex: 1, width: '100%', backgroundColor: '#000' }}>
            <WebView originWhitelist={['*']} source={{ html: htmlContent }} style={{ flex: 1, backgroundColor: '#000' }} scrollEnabled={false} mixedContentMode="always" javaScriptEnabled={true} domStorageEnabled={true} startInLoadingState={true} renderLoading={onLoadStart} androidLayerType="software" opacity={0.99}
                onMessage={(event) => { try { const data = JSON.parse(event.nativeEvent.data); if (data.type === 'IMG_ERROR' && onError) onError(); } catch (e) { if (event.nativeEvent.data === 'ERROR' && onError) onError(); } }}
                onError={() => onError && onError()}
            />
        </View>
    );
});

const downsample = (arr: number[], maxPoints = 30): number[] => {
    if (!arr || arr.length <= maxPoints) return arr;

    const step = Math.ceil(arr.length / maxPoints);
    const result: number[] = [];

    for (let i = 0; i < arr.length; i += step) {
        result.push(arr[i]);
    }

    return result;
};


const StatusCard = React.memo(({ title, icon, value, unit, history }: any) => {
    const [chartWidth, setChartWidth] = useState(0);
    const getColor = () => { if (title === "Ammonia") { const num = parseFloat(value); if (isNaN(num)) return "#4C505D"; if (num < 5) return "#1FCB4F"; if (num < 10) return "#FFC107"; return "#D32F2F"; } return "#1FCB4F"; };
    const getLineColor = () => { if (title === "Ammonia") { const num = parseFloat(value); return (!isNaN(num) && num >= 10) ? "#D32F2F" : "#4C505D"; } return "#487307"; };
    const prepareData = (arr: number[]) => { if (!arr || arr.length === 0) return []; const valid = arr.filter(n => !isNaN(n)); if (valid.length === 0) return []; const max = Math.max(...valid); const min = Math.min(...valid); if (max === min) return valid.map(() => ({ value: 0.5 })); return valid.map(v => ({ value: (v - min) / (max - min) })); };
    const chartData = prepareData(history);
    const safeWidth = chartWidth > 25 ? chartWidth - 25 : 0;

    return (
        <View style={styles.statusCard}>
            <View style={styles.cardHeader}>
                <View style={{ width: 50, height: 40, borderRadius: 100, backgroundColor: "#487307", alignItems: "center", justifyContent: "center", marginRight: 8 }}>{icon}</View>
                <Text style={styles.cardTitle}>{title}</Text>
            </View>
            <View style={styles.cardBody}>
                <View style={styles.cardValueWrapper}><Text style={[styles.cardValue, { color: getColor() }]}>{`${value} ${unit}`}</Text></View>
                {chartData.length > 1 && (
                    <View style={styles.cardChartWrapper} onLayout={(event) => setChartWidth(event.nativeEvent.layout.width)}>
                        {safeWidth > 0 && (
                            <View style={{ width: safeWidth, height: "auto", justifyContent: "center", overflow: 'hidden', marginVertical: -2 }}>
                                <LineChart key={safeWidth} data={chartData} height={50} width={safeWidth} color={getLineColor()} thickness={3.5} curved hideRules hideDataPoints hideYAxisText hideAxesAndRules initialSpacing={0} endSpacing={0} adjustToWidth isAnimated={false} areaChart={false} startFillColor={'#D3D3D3'} startOpacity={0.5} endFillColor={'#D3D3D3'} endOpacity={0.0} />
                            </View>
                        )}
                    </View>
                )}
            </View>
        </View>
    );
});

const SnapshotCard = memo(({ snapshot }: { snapshot: any }) => {
    const [showThermal, setShowThermal] = useState(true);
    const formatDate = (dateString: string) => { try { const date = new Date(dateString); return date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); } catch { return dateString; } };
    return (
        <View style={styles.snapshotCard}>
            <View style={styles.snapshotImageContainer}>
                {snapshot.imageUrl ? (
                    <>
                        {showThermal && snapshot.thermalUrl ? (
                            <ThermalImage frameUrl={""} thermalUrl={snapshot.thermalUrl} style={styles.snapshotImage} refreshInterval={0} interpolationFactor={1.1} />
                        ) : (
                            <Image source={{ uri: snapshot.imageUrl }} style={styles.snapshotImage} resizeMode="cover" />
                        )}
                        <TouchableOpacity style={styles.cardToggleButton} onPress={() => setShowThermal(!showThermal)} activeOpacity={0.7}>
                            <MaterialCommunityIcons name="camera-flip-outline" size={20} color="#fff" />
                        </TouchableOpacity>
                    </>
                ) : (
                    <View style={styles.snapshotPlaceholder}><Text style={styles.placeholderText}>No image available</Text></View>
                )}
            </View>
            <View style={styles.snapshotInfo}>
                <Text style={styles.snapshotDate}>{formatDate(snapshot.ts)}</Text>
                {snapshot.reading && (
                    <View style={styles.readingInfo}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}><MaterialCommunityIcons name="thermometer" size={20} color="#333" /><Text style={styles.readingText}>{snapshot.reading.t_avg_c?.toFixed(1) || "N/A"} °C</Text></View>
                        <View style={{ flexDirection: "row", alignItems: "center" }}><MaterialCommunityIcons name="water" size={20} color="#333" /><Text style={styles.readingText}>{snapshot.reading.humidity_rh?.toFixed(1) || "N/A"} %</Text></View>
                    </View>
                )}
            </View>
        </View>
    );
});

function MainScreenContent() {
    const { start } = useTourGuideController();

    const insets = useSafeAreaInsets();

    const [activeTab, setActiveTab] = useState<"live" | "diary">("live");
    const [viewMode, setViewMode] = useState<"thermal" | "optical">("thermal");

    const [opticalStatus, setOpticalStatus] = useState<'connected' | 'error' | 'loading'>('connected');
    const [opticalKey, setOpticalKey] = useState(0);
    const [thermalUrl, setThermalUrl] = useState(STREAM_URL);

    useKeepAwake();
    const deviceId = DEVICE_ID;
    const { data: liveThermalData, status: streamStatus, error: streamError } = useThermalSSE(thermalUrl);
    const { snapshots, loading: snapshotsLoading, error: snapshotsError, hasMore, loadMore, refresh } = useSnapshots(deviceId);
    const [readings, setReadings] = useState<ReadingRow | null>(null);
    const [loadingReadings, setLoadingReadings] = useState(true);
    const [tempHistory, setTempHistory] = useState<number[]>([]);
    const [humidityHistory, setHumidityHistory] = useState<number[]>([]);
    const [ammoniaHistory, setAmmoniaHistory] = useState<number[]>([]);

    const handleToggleView = useCallback(() => {
        if (viewMode === 'thermal') {
            setViewMode('optical');
            setOpticalStatus('loading');
            setOpticalKey(prev => prev + 1);
        } else {
            setViewMode('thermal');
            setThermalUrl(`${STREAM_URL}?t=${Date.now()}`);
        }
    }, [viewMode]);

    useEffect(() => {
        let interval: number;
        const loadReadings = async () => {
            setLoadingReadings(true);
            try {
                const now = new Date();
                const futureBuffer = new Date(now.getTime() + 24 * 60 * 60 * 1000);
                const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                const data = await fetchReadings(deviceId, from.toISOString(), futureBuffer.toISOString(), 2000);

                if (data && data.length > 0) {
                    const sortedNewestFirst = [...data].sort((a: any, b: any) => new Date(b.ts || b.created_at).getTime() - new Date(a.ts || a.created_at).getTime());
                    const latestReading = sortedNewestFirst[0];
                    setReadings(latestReading);
                    const latestTime = new Date(latestReading.ts || (latestReading as any).created_at).getTime();
                    const oneHoursBeforeLast = latestTime - (1.2 * 60 * 60 * 1000);
                    const chartContextData = sortedNewestFirst.filter((r: any) => new Date(r.ts || r.created_at).getTime() >= oneHoursBeforeLast);
                    const sortedOldestFirst = [...chartContextData].reverse();
                    setTempHistory(
    downsample(sortedOldestFirst.map(r => r.t_avg_c ?? 0), 30)
);

setHumidityHistory(
    downsample(sortedOldestFirst.map(r => r.humidity_rh ?? 0), 30)
);

setAmmoniaHistory(
    downsample(sortedOldestFirst.map(r => (r.gas_res_ohm ?? 0) / 1000), 30)
);

                }
            } catch (err) { console.error("[POLL] Error fetching readings:", err); } finally { setLoadingReadings(false); }
        };
        loadReadings();
        interval = setInterval(loadReadings, 5000) as unknown as number;
        return () => clearInterval(interval);
    }, [deviceId]);

    useEffect(() => {
        let timer: any;
        if (viewMode === 'optical') {
            if (opticalStatus === 'error') { timer = setTimeout(() => setOpticalStatus('loading'), 3000); } else if (opticalStatus === 'loading') { timer = setTimeout(() => { setOpticalStatus('connected'); }, 1000); }
        }
        return () => clearTimeout(timer);
    }, [opticalStatus, viewMode]);

    const renderLoadingView = (text = "Reconnecting...") => (
        <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#487307" />
            <Text style={{ marginTop: 10, color: '#666', fontWeight: '500' }}>{text}</Text>
        </View>
    );

    const renderSnapshotItem: ListRenderItem<any> = useCallback(({ item: snapshot }) => {
        return <SnapshotCard snapshot={snapshot} />;
    }, []);

    const startTourWithDelay = () => {
        setTimeout(() => {
            start();
        }, 300);
    };


    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <View style={{ width: 60, height: 55 }}>
                        <Image source={require("../../assets/images/swinetrack-logo.png")} style={{ width: '100%', height: '100%', resizeMode: 'contain' }} />
                    </View>

                    <TourGuideZone
                        zone={4}
                        text="Tap this question mark anytime to replay this tour."
                        shape="circle"
                    >
                        <TouchableOpacity
                            onPress={startTourWithDelay}
                            style={{ padding: 8, margin: -8 }}
                        >
                            <Ionicons name="information-circle-outline" size={28} color="#fff" />
                        </TouchableOpacity>
                    </TourGuideZone>
                </View>

                <Text style={styles.welcomeText}>Welcome back!</Text>
                <Text style={styles.subText}>Today's pig status</Text>
                <View style={styles.divider} />
            </View>

            {activeTab === "live" ? (
                <ScrollView style={styles.scrollArea} contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}>

                    <TourGuideZone
                        zone={2}
                        text="This is your main monitor. It shows live Thermal or Optical video. The swap button is in the corner."
                        borderRadius={10}
                        maskOffset={-5}
                        style={{ padding: 4 }}
                    >
                        <View style={styles.feedBox} collapsable={false}>
                            <TouchableOpacity
                                style={styles.toggleButton}
                                onPress={handleToggleView}
                            >
                                <MaterialCommunityIcons name={viewMode === 'thermal' ? "camera-iris" : "thermometer"} size={20} color="#fff" />
                                <Text style={styles.toggleButtonText}>{viewMode === 'thermal' ? " View Camera" : "View Thermal"}</Text>
                            </TouchableOpacity>

                            {viewMode === 'optical' ? (
                                <View style={styles.opticalContainer}>
                                    {opticalStatus === 'connected' ? (
                                        <LiveStreamView key={opticalKey} streamUrl={OPTICAL_URL} onLoadStart={() => renderLoadingView("Connecting to Camera...")} onError={() => setOpticalStatus('error')} />
                                    ) : opticalStatus === 'error' ? (
                                        <View style={styles.errorContainer}>
                                            <MaterialCommunityIcons name="video-off-outline" size={40} color="#d32f2f" style={{ marginBottom: 10 }} /><Text style={styles.errorText}>Camera Offline</Text><Text style={{ fontSize: 12, color: '#999', marginTop: 5 }}>Host not reachable</Text>
                                        </View>
                                    ) : (
                                        renderLoadingView("Reconnecting to Camera...")
                                    )}
                                </View>
                            ) : (
                                <View style={styles.opticalContainer}>
                                    {streamStatus === 'connected' && liveThermalData ? (
                                        <ThermalImage frameUrl={OPTICAL_URL} thermalData={liveThermalData} style={styles.liveImage} interpolationFactor={1.1} refreshInterval={0} />
                                    ) : streamStatus === 'error' ? (
                                        <View style={styles.errorContainer}>
                                            <MaterialCommunityIcons name="video-off-outline" size={40} color="#d32f2f" style={{ marginBottom: 10 }} /><Text style={styles.errorText}>Thermal Offline</Text><Text style={{ fontSize: 12, color: '#999', marginTop: 5 }}>{streamError}</Text>
                                        </View>
                                    ) : (
                                        renderLoadingView("Connecting to Thermal...")
                                    )}
                                </View>
                            )}
                        </View>
                    </TourGuideZone>

                    <TourGuideZone
                        zone={3}
                        text="Pen Status: See graphs and current values for Temperature, Humidity, and Ammonia."
                        borderRadius={10}
                        style={{ padding: 4 }}
                    >
                        <View collapsable={false}>
                            <Text style={styles.penStatusTitle}>Pen Status</Text>

                            <View>
                                <StatusCard title="Temperature" icon={<MaterialCommunityIcons name="thermometer-low" size={25} color="#fff" />} value={readings?.t_avg_c?.toFixed(1) ?? "N/A"} unit="°C" history={tempHistory} />
                            </View>

                            <View>
                                <StatusCard title="Humidity" icon={<MaterialCommunityIcons name="water-outline" size={24} color="#fff" />} value={readings?.humidity_rh?.toFixed(1) ?? "N/A"} unit="%" history={humidityHistory} />
                            </View>

                            <View>
                                <StatusCard title="Ammonia" icon={<MaterialCommunityIcons name="weather-fog" size={16} color="#fff" />} value={readings?.gas_res_ohm ? (readings.gas_res_ohm / 1000).toFixed(1) : "N/A"} unit="kΩ" history={ammoniaHistory} />
                            </View>
                        </View>
                    </TourGuideZone>
                </ScrollView>
            ) : (
                <View style={{ flex: 1, backgroundColor: '#f5f5f5' }}>
                    {snapshotsError ? (
                        <View style={styles.errorContainer}><Text style={styles.errorText}>Error loading snapshots</Text><Text style={styles.errorSubText}>{snapshotsError}</Text><TouchableOpacity onPress={refresh} style={styles.retryButton}><Text style={styles.retryButtonText}>Try Again</Text></TouchableOpacity></View>
                    ) : (
                        <FlatList data={snapshots} keyExtractor={(item) => item.id.toString()} renderItem={renderSnapshotItem} contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom }} initialNumToRender={3} maxToRenderPerBatch={3} windowSize={5} removeClippedSubviews={true} refreshControl={<RefreshControl refreshing={snapshotsLoading} onRefresh={refresh} colors={["#487307"]} />} ListEmptyComponent={!snapshotsLoading ? (<View style={styles.emptyState}><Text style={styles.emptyStateIcon}>📸</Text><Text style={styles.emptyStateText}>No snapshots yet</Text><Text style={styles.emptyStateText}>Snapshots will appear here when available</Text></View>) : null} ListFooterComponent={<View style={{ paddingVertical: 20 }}>{snapshotsLoading ? (<ActivityIndicator size="small" color="#487307" />) : hasMore ? (<TouchableOpacity onPress={loadMore} style={styles.loadMoreButton}><Text style={styles.loadMoreText}>Load More</Text></TouchableOpacity>) : snapshots.length > 0 ? (<Text style={styles.noMoreText}>No more snapshots to load</Text>) : null}</View>} />
                    )}
                </View>
            )}
        </View>
    );
}

export default function Index() {
    return (
        <TourGuideProvider
            preventOutsideInteraction
            backdropColor="rgba(0, 0, 0, 0.7)"
            tooltipStyle={{ borderRadius: 10, paddingTop: 10 }}
            androidStatusBarVisible={true}
            labels={{
                previous: "Back",
                next: "Next",
                skip: "Skip",
                finish: "Done",
            }}
        >
            <MainScreenContent />
        </TourGuideProvider>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#fff" },
    header: { backgroundColor: "#487307", paddingTop: 30, paddingBottom: 30, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
    welcomeText: { fontSize: 25, fontWeight: "bold", color: "#fff", marginTop: 2, marginLeft: 15 },
    subText: { fontSize: 14, color: "#d8f2c1", marginTop: 4, marginLeft: 15 },
    divider: { height: 1, backgroundColor: "#fff", marginTop: 12, opacity: 0.5 },
    tabs: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 12, backgroundColor: "#f5f5f5" },
    tabText: { fontSize: 14, color: "#555", fontWeight: "500" },
    activeTab: { fontWeight: "bold", borderBottomWidth: 2, borderBottomColor: "#487307", color: "#487307" },
    scrollArea: { flex: 1, padding: 16 },
    feedBox: { height: 250, borderRadius: 10, backgroundColor: "#e6e6e6", justifyContent: "center", marginBottom: 16, overflow: "hidden", position: 'relative' },
    opticalContainer: { width: '100%', height: '100%', backgroundColor: '#e6e6e6', justifyContent: 'center', alignItems: 'center', flex: 1 },
    liveImage: { width: "100%", height: "100%", borderRadius: 10 },
    toggleButton: { position: 'absolute', top: 10, left: 10, zIndex: 30, backgroundColor: "#487307", paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 6 },
    toggleButtonText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    noFeedText: { fontSize: 16, color: "#888" },
    loadingContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e6e6e6', height: '100%', width: '100%', zIndex: 20 },
    errorContainer: { alignItems: "center", justifyContent: "center", padding: 16 },
    errorText: { fontSize: 16, color: "#d32f2f", fontWeight: "600", marginBottom: 4 },
    errorSubText: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 12 },
    penStatusTitle: { fontSize: 18, fontWeight: "bold", color: "#333", marginBottom: 10 },
    statusCard: { backgroundColor: "#f9f9f9", borderRadius: 10, padding: 16, marginBottom: 20, borderWidth: 1, borderColor: "#ddd" },
    cardHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    cardTitle: { fontSize: 18, fontWeight: "600", color: "#737375" },
    cardBody: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    cardValueWrapper: { minWidth: 85, alignItems: 'flex-start' },
    cardChartWrapper: { flex: 1, alignItems: 'center', paddingLeft: 10, paddingRight: 10 },
    cardValue: { fontSize: 24, color: "#1FCB4F", fontWeight: "500", backgroundColor: "#FFFFFF", borderWidth: 1.7, borderRadius: 10, borderColor: "#E8E8E8", padding: 7 },
    diaryContainer: { padding: 4 },
    diaryHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, paddingHorizontal: 4 },
    diaryTitle: { fontSize: 18, fontWeight: 'bold', color: '#333' },
    diaryToggleButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#487307', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 16, gap: 4 },
    diaryToggleText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    snapshotCard: { backgroundColor: "#fff", borderRadius: 12, marginBottom: 16, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, overflow: "hidden" },
    snapshotImageContainer: { width: "100%", height: 200, backgroundColor: '#e6e6e6', position: 'relative', overflow: 'hidden' },
    snapshotImage: { width: "100%", height: 200 },
    cardToggleButton: { position: 'absolute', top: 10, left: 10, backgroundColor: 'rgba(0,0,0,0.5)', padding: 8, borderRadius: 20, zIndex: 10 },
    snapshotPlaceholder: { width: "100%", height: 200, backgroundColor: "#e6e6e6", justifyContent: "center", alignItems: "center" },
    placeholderText: { color: "#888", fontSize: 14 },
    snapshotInfo: { padding: 12 },
    snapshotDate: { fontSize: 14, fontWeight: "400", color: "#333", marginBottom: 8 },
    readingInfo: { flexDirection: "row", justifyContent: "space-between" },
    readingText: { fontSize: 12, color: "#666" },
    loader: { marginVertical: 16 },
    loadMoreButton: { backgroundColor: "#487307", padding: 12, borderRadius: 8, alignItems: "center", marginVertical: 16, width: '100%' },
    loadMoreText: { color: "#fff", fontWeight: "600" },
    noMoreText: { textAlign: "center", color: "#666", marginVertical: 16, fontStyle: "italic" },
    emptyState: { alignItems: "center", justifyContent: "center", padding: 40, backgroundColor: "#f9f9f9", borderRadius: 12, marginVertical: 20 },
    emptyStateIcon: { fontSize: 40, marginBottom: 12 },
    emptyStateText: { fontSize: 16, fontWeight: "600", color: "#333", marginBottom: 4 },
    emptyStateSubText: { fontSize: 14, color: "#666", textAlign: "center" },
    retryButton: { backgroundColor: "#487307", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
    retryButtonText: { color: "#fff", fontWeight: "500" },
});