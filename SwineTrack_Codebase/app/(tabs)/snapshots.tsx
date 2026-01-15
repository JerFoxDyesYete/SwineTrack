import React, { memo, useCallback, useMemo, useState, useEffect } from "react";
import {
    View,
    Text,
    FlatList,
    TouchableOpacity,
    RefreshControl,
    StyleSheet,
    Image,
    Platform,
    ScrollView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { MaterialCommunityIcons, Ionicons } from "@expo/vector-icons";

import { DEVICE_ID } from "@/constants";
import { useSnapshots } from "@/features/snapshots/useSnapshots";
import { ThermalImage } from "@/components/ThermalImage";

const clampStartOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
};

const clampEndOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
};

const pad2 = (n: number) => String(n).padStart(2, "0");

const formatTimeHM = (iso: string) => {
    const dt = new Date(iso);
    return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
};

const downsamplePairs = (
    items: { ts: string; value: number }[],
    maxPoints = 60
) => {
    if (!items || items.length <= maxPoints) return items;
    const step = Math.ceil(items.length / maxPoints);
    const out: { ts: string; value: number }[] = [];
    for (let i = 0; i < items.length; i += step) out.push(items[i]);
    return out;
};

const SnapshotCard = memo(({ snapshot }: { snapshot: any }) => {
    const [showThermal, setShowThermal] = useState(true);

    const formatDate = (dateString: string) => {
        try {
            const date = new Date(dateString);
            return (
                date.toLocaleDateString() +
                " " +
                date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            );
        } catch {
            return dateString;
        }
    };

    return (
        <View style={styles.snapshotCard}>
            <View style={styles.snapshotImageContainer}>
                {snapshot.imageUrl ? (
                    <>
                        {showThermal && snapshot.thermalUrl ? (
                            <ThermalImage
                                frameUrl={""}
                                thermalUrl={snapshot.thermalUrl}
                                style={styles.snapshotImage}
                                refreshInterval={0}
                                interpolationFactor={1.1}
                            />
                        ) : (
                            <Image
                                source={{ uri: snapshot.imageUrl }}
                                style={styles.snapshotImage}
                                resizeMode="cover"
                            />
                        )}

                        <TouchableOpacity
                            style={styles.cardToggleButton}
                            onPress={() => setShowThermal(!showThermal)}
                            activeOpacity={0.7}
                        >
                            <MaterialCommunityIcons
                                name="camera-flip-outline"
                                size={20}
                                color="#fff"
                            />
                        </TouchableOpacity>
                    </>
                ) : (
                    <View style={styles.snapshotPlaceholder}>
                        <Text style={styles.placeholderText}>No image available</Text>
                    </View>
                )}
            </View>

            <View style={styles.snapshotInfo}>
                <Text style={styles.snapshotDate}>{formatDate(snapshot.ts)}</Text>

                {snapshot.reading && (
                    <View style={styles.readingInfo}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <MaterialCommunityIcons name="thermometer" size={20} color="#333" />
                            <Text style={styles.readingText}>
                                {snapshot.reading.t_avg_c?.toFixed(1) || "N/A"} °C
                            </Text>
                        </View>

                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                            <MaterialCommunityIcons name="water" size={20} color="#333" />
                            <Text style={styles.readingText}>
                                {snapshot.reading.humidity_rh?.toFixed(1) || "N/A"} %
                            </Text>
                        </View>
                    </View>
                )}
            </View>
        </View>
    );
});

export default function SnapshotLibrary() {
    const SUMMARY_MAX_SNAPSHOTS = 1000;

    const insets = useSafeAreaInsets();
    const deviceId = DEVICE_ID;

    const { snapshots, loading: snapshotsLoading, error: snapshotsError, hasMore, loadMore, refresh } =
        useSnapshots(deviceId);

    const [activeTab, setActiveTab] = useState<"diary" | "summary">("diary");
    const [summaryLoaded, setSummaryLoaded] = useState(false);

    useEffect(() => {
        if (activeTab !== "summary") return;

        let cancelled = false;

        const loadUntilCap = async () => {
            if (snapshots.length >= SUMMARY_MAX_SNAPSHOTS) return;

            while (
                !cancelled &&
                hasMore &&
                snapshots.length < SUMMARY_MAX_SNAPSHOTS
            ) {
                await loadMore();
                await new Promise((r) => setTimeout(r, 0));
            }
        };

        loadUntilCap();

        return () => {
            cancelled = true;
        };
    }, [activeTab, hasMore, snapshots.length, loadMore]);

    const clampValidEndOfMonth = (d: Date) => {
        const year = d.getFullYear();
        const month = d.getMonth();
        const lastDay = new Date(year, month + 1, 0).getDate();

        const safeDay = Math.min(d.getDate(), lastDay);
        const x = new Date(year, month, safeDay);
        x.setHours(23, 59, 59, 999);
        return x;
    };


const normalizedRange = useMemo(() => {
    const now = new Date();

    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    start.setHours(0, 0, 0, 0);

    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    end.setHours(23, 59, 59, 999);

    return { start, end };
}, []);

    const summary = useMemo(() => {
        const startMs = normalizedRange.start.getTime();
        const endMs = normalizedRange.end.getTime();

        const raw = snapshots
            .filter((s: any) => s?.reading?.t_avg_c != null && s?.ts)
            .map((s: any) => {
                const tsMs = new Date(s.ts).getTime();
                return {
                    ts: s.ts,
                    tsMs,
                    value: Number(s.reading.t_avg_c),
                };
            })
            .filter((p) =>
                Number.isFinite(p.value) &&
                p.tsMs >= startMs &&
                p.tsMs <= endMs
            );

        if (raw.length === 0) {
            return {
                count: 0,
                avg: 0,
                min: 0,
                max: 0,
                hottestTs: null as string | null,
                hottestValue: null as number | null,
                spikes: [] as { ts: string; from: number; to: number; delta: number }[],
                chartData: [] as any[],
                dist: { cold: 0, normal: 0, hot: 0, critical: 0 },
            };
        }

        const series = downsamplePairs(
            raw.map((r) => ({ ts: r.ts, value: r.value })),
            70
        );

        const values = raw.map((r) => r.value);

        const avg = values.reduce((a, b) => a + b, 0) / values.length;
        const min = Math.min(...values);
        const max = Math.max(...values);

        const hottest = raw.reduce((prev, cur) =>
            cur.value > prev.value ? cur : prev
        );

        const spikes: { ts: string; from: number; to: number; delta: number }[] = [];
        const spikeThreshold = 1.5;

        for (let i = 1; i < raw.length; i++) {
            const delta = raw[i].value - raw[i - 1].value;
            if (delta >= spikeThreshold) {
                spikes.push({
                    ts: raw[i].ts,
                    from: raw[i - 1].value,
                    to: raw[i].value,
                    delta,
                });
            }
        }

        const chartData = series.map((p, idx) => ({
            value: p.value,
            label:
                idx % Math.max(1, Math.floor(series.length / 6)) === 0
                    ? formatTimeHM(p.ts)
                    : "",
        }));

        let cold = 0, normal = 0, hot = 0, critical = 0;

        raw.forEach((p) => {
            if (p.value < 30) cold++;
            else if (p.value < 35) normal++;
            else if (p.value < 40) hot++;
            else critical++;
        });

        return {
            count: raw.length,
            avg,
            min,
            max,
            hottestTs: hottest.ts,
            hottestValue: hottest.value,
            spikes,
            chartData,
            dist: { cold, normal, hot, critical },
        };
    }, [snapshots, normalizedRange]);


    const renderSnapshotItem = useCallback(({ item }: { item: any }) => {
        return <SnapshotCard snapshot={item} />;
    }, []);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", width: "100%" }}>
                    <View style={{ width: 60, height: 55 }}>
                        <Image
                            source={require("../../assets/images/swinetrack-logo.png")}
                            style={{ width: "100%", height: "100%", resizeMode: "contain" }}
                        />
                    </View>

                    <TouchableOpacity
                        onPress={() => {
                            setActiveTab("diary");
                            setSummaryLoaded(false);
                        }}
                    >
                        <Ionicons name="information-circle-outline" size={28} color="#fff" />
                    </TouchableOpacity>
                </View>

                <Text style={styles.welcomeText}>Snapshot Diary</Text>
                <Text style={styles.subText}>Snapshot Diary Summary</Text>
                <View style={styles.divider} />
            </View>

            <View style={styles.tabs}>
                <TouchableOpacity onPress={() => setActiveTab("diary")}>
                    <Text style={[styles.tabText, activeTab === "diary" && styles.activeTab]}>
                        Snapshot Diary
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity onPress={() => setActiveTab("summary")}>
                    <Text style={[styles.tabText, activeTab === "summary" && styles.activeTab]}>
                        Summary
                    </Text>
                </TouchableOpacity>
            </View>

            {activeTab === "diary" ? (
                <View style={{ flex: 1, backgroundColor: "#f5f5f5" }}>
                    {snapshotsError ? (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>Error loading snapshots</Text>
                            <Text style={styles.errorSubText}>{snapshotsError}</Text>
                            <TouchableOpacity onPress={refresh} style={styles.retryButton}>
                                <Text style={styles.retryButtonText}>Try Again</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <FlatList
                            data={snapshots}
                            keyExtractor={(item) => item.id.toString()}
                            renderItem={renderSnapshotItem}
                            contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom }}
                            initialNumToRender={3}
                            maxToRenderPerBatch={3}
                            windowSize={5}
                            removeClippedSubviews={true}
                            refreshControl={
                                <RefreshControl
                                    refreshing={snapshotsLoading}
                                    onRefresh={refresh}
                                    colors={["#487307"]}
                                />
                            }
                            ListFooterComponent={
                                <View style={{ paddingVertical: 20 }}>
                                    {snapshotsLoading ? (
                                        <Text style={{ textAlign: "center", color: "#666" }}>Loading...</Text>
                                    ) : hasMore ? (
                                        <TouchableOpacity onPress={loadMore} style={styles.loadMoreButton}>
                                            <Text style={styles.loadMoreText}>Load More</Text>
                                        </TouchableOpacity>
                                    ) : snapshots.length > 0 ? (
                                        <Text style={styles.noMoreText}>No more snapshots to load</Text>
                                    ) : null}
                                </View>
                            }
                        />
                    )}
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1, backgroundColor: "#f5f5f5" }}
                    contentContainerStyle={{ padding: 16, paddingBottom: 40 + insets.bottom }}
                >

                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryTitle}>Temperature Summary (MLX)</Text>

                        {summary.count === 0 ? (
                            <Text style={styles.noDataText}>No temperature data found in this date range.</Text>
                        ) : (
                            <>
                                <View style={styles.statRow}>
                                    <View style={styles.statPill}>
                                        <Text style={styles.statLabel}>Records</Text>
                                        <Text style={styles.statValue}>{summary.count}</Text>
                                    </View>
                                    <View style={styles.statPill}>
                                        <Text style={styles.statLabel}>Average</Text>
                                        <Text style={styles.statValue}>{summary.avg.toFixed(1)} °C</Text>
                                    </View>
                                </View>

                                <View style={styles.statRow}>
                                    <View style={styles.statPill}>
                                        <Text style={styles.statLabel}>Min</Text>
                                        <Text style={styles.statValue}>{summary.min.toFixed(1)} °C</Text>
                                    </View>
                                    <View style={styles.statPill}>
                                        <Text style={styles.statLabel}>Max</Text>
                                        <Text style={[styles.statValue, { color: "#d32f2f" }]}>{summary.max.toFixed(1)} °C</Text>
                                    </View>
                                </View>

                                {summary.hottestTs && summary.hottestValue != null && (
                                    <View style={styles.hottestBox}>
                                        <MaterialCommunityIcons name="fire" size={18} color="#d32f2f" />
                                        <Text style={styles.hottestText}>
                                            Hottest at {new Date(summary.hottestTs).toLocaleString()} ({summary.hottestValue.toFixed(1)} °C)
                                        </Text>
                                    </View>
                                )}
                            </>
                        )}
                    </View>

                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryTitle}>Temperature Distribution</Text>

                        {summary.count === 0 ? (
                            <Text style={styles.noDataText}>
                                No temperature data available for this range.
                            </Text>
                        ) : (
                            <>
                                {[
                                    { label: "Cold (<30°C)", value: summary.dist.cold, color: "#4FC3F7" },
                                    { label: "Comfort (30–35°C)", value: summary.dist.normal, color: "#81C784" },
                                    { label: "Heat Stress (35–40°C)", value: summary.dist.hot, color: "#FFB74D" },
                                    { label: "Critical (>40°C)", value: summary.dist.critical, color: "#E57373" },
                                ].map((item, index) => {
                                    const percent = (item.value / summary.count) * 100;

                                    return (
                                        <View key={index} style={{ marginBottom: 10 }}>
                                            <Text style={{ fontSize: 12, color: "#333", marginBottom: 4 }}>
                                                {item.label} — {item.value}
                                            </Text>

                                            <View
                                                style={{
                                                    height: 10,
                                                    backgroundColor: "#eee",
                                                    borderRadius: 6,
                                                    overflow: "hidden",
                                                }}
                                            >
                                                <View
                                                    style={{
                                                        width: `${percent}%`,
                                                        height: "100%",
                                                        backgroundColor: item.color,
                                                        borderRadius: 6,
                                                    }}
                                                />
                                            </View>
                                        </View>
                                    );
                                })}
                            </>
                        )}
                    </View>


                    <View style={styles.summaryCard}>
                        <Text style={styles.summaryTitle}>Temperature Spikes</Text>
                        <Text style={styles.spikeHint}>
                            Spike = increase of 1.5°C or more compared to the previous record.
                        </Text>

                        {summary.spikes.length === 0 ? (
                            <Text style={styles.noDataText}>No significant spikes detected in this range.</Text>
                        ) : (
                            summary.spikes.slice(0, 20).map((s, i) => (
                                <View key={i} style={styles.spikeRow}>
                                    <View style={styles.spikeDot} />
                                    <Text style={styles.spikeText}>
                                        {new Date(s.ts).toLocaleString()} — {s.from.toFixed(1)}°C → {s.to.toFixed(1)}°C (+{s.delta.toFixed(1)}°C)
                                    </Text>
                                </View>
                            ))
                        )}

                        {summary.spikes.length > 20 && (
                            <Text style={styles.moreHint}>
                                Showing first 20 spikes. Narrow your date range to see more detail.
                            </Text>
                        )}
                    </View>
                </ScrollView>
            )}
        </View>
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
    },
    welcomeText: { fontSize: 25, fontWeight: "bold", color: "#fff", marginTop: 2, marginLeft: 15 },
    subText: { fontSize: 14, color: "#d8f2c1", marginTop: 4, marginLeft: 15 },
    divider: { height: 1, backgroundColor: "#fff", marginTop: 12, opacity: 0.5 },

    tabs: { flexDirection: "row", justifyContent: "space-around", paddingVertical: 12, backgroundColor: "#f5f5f5" },
    tabText: { fontSize: 14, color: "#555", fontWeight: "500" },
    activeTab: { fontWeight: "bold", borderBottomWidth: 2, borderBottomColor: "#487307", color: "#487307" },

    summaryCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: "#e8e8e8",
    },
    summaryTitle: { fontSize: 16, fontWeight: "700", color: "#333", marginBottom: 10 },

    dateRow: { flexDirection: "row", gap: 10 },
    dateBox: {
        flex: 1,
        backgroundColor: "#f7fbf4",
        borderWidth: 1,
        borderColor: "#d9e8cf",
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    dateLabel: { fontSize: 12, color: "#487307", fontWeight: "700", marginBottom: 2 },
    dateValue: { fontSize: 13, color: "#333", fontWeight: "600" },
    rangeHint: { marginTop: 10, fontSize: 12, color: "#666" },

    statRow: { flexDirection: "row", gap: 10, marginTop: 8 },
    statPill: {
        flex: 1,
        backgroundColor: "#f9f9f9",
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    statLabel: { fontSize: 12, color: "#777", fontWeight: "600" },
    statValue: { fontSize: 16, color: "#333", fontWeight: "800", marginTop: 2 },

    hottestBox: {
        marginTop: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: "#fff5f5",
        borderWidth: 1,
        borderColor: "#ffd0d0",
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
    },
    hottestText: { flex: 1, color: "#7a1c1c", fontWeight: "700", fontSize: 13 },

    spikeHint: { fontSize: 12, color: "#666", marginBottom: 10 },
    spikeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
    spikeDot: { width: 8, height: 8, borderRadius: 99, backgroundColor: "#487307", marginTop: 5 },
    spikeText: { flex: 1, fontSize: 13, color: "#333", lineHeight: 18 },
    moreHint: { marginTop: 8, fontSize: 12, color: "#666", fontStyle: "italic" },

    noDataText: { fontSize: 13, color: "#777" },

    snapshotCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        overflow: "hidden",
    },
    snapshotImageContainer: { width: "100%", height: 200, backgroundColor: "#e6e6e6", position: "relative", overflow: "hidden" },
    snapshotImage: { width: "100%", height: 200 },
    cardToggleButton: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(0,0,0,0.5)", padding: 8, borderRadius: 20, zIndex: 10 },
    snapshotPlaceholder: { width: "100%", height: 200, backgroundColor: "#e6e6e6", justifyContent: "center", alignItems: "center" },
    placeholderText: { color: "#888", fontSize: 14 },
    snapshotInfo: { padding: 12 },
    snapshotDate: { fontSize: 14, fontWeight: "400", color: "#333", marginBottom: 8 },
    readingInfo: { flexDirection: "row", justifyContent: "space-between" },
    readingText: { fontSize: 12, color: "#666", marginLeft: 6 },

    loadMoreButton: { backgroundColor: "#487307", padding: 12, borderRadius: 8, alignItems: "center", marginVertical: 16, width: "100%" },
    loadMoreText: { color: "#fff", fontWeight: "600" },
    noMoreText: { textAlign: "center", color: "#666", marginVertical: 16, fontStyle: "italic" },

    errorContainer: { alignItems: "center", justifyContent: "center", padding: 16, marginTop: 30 },
    errorText: { fontSize: 16, color: "#d32f2f", fontWeight: "600", marginBottom: 4 },
    errorSubText: { fontSize: 14, color: "#666", textAlign: "center", marginBottom: 12 },
    retryButton: { backgroundColor: "#487307", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 6 },
    retryButtonText: { color: "#fff", fontWeight: "500" },
});
