import React, { useRef, useEffect, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Animated,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  RefreshControl,
  Image,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { listAlerts } from "@/features/alerts/api";
import { DEVICE_ID } from "@/constants";
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  TourGuideProvider,
  TourGuideZone,
  useTourGuideController,
} from "rn-tourguide";

type AlertRow = {
  id: string;
  alert_type: string;
  severity: string;
  ts: string;
  message: string;
};

type FilterType = "all" | "critical" | "warning";

function AlertsScreenContent() {
  const { start, canStart } = useTourGuideController();
  const insets = useSafeAreaInsets();

  const scaleAnim = useRef(new Animated.Value(0)).current;
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedAlert, setExpandedAlert] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");

  const deviceId = DEVICE_ID;

  useEffect(() => {
  }, [canStart]); 

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const loadAlerts = async () => {
    try {
      setError(null);
      const data = await listAlerts(deviceId, 0, 50);
      setAlerts(data || []);
    } catch (err) {
      console.error("Error loading alerts:", err);
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    loadAlerts();
  };

  const toggleExpanded = (alertId: string) => {
    setExpandedAlert((prev) => (prev === alertId ? null : alertId));
  };

  const formatDisplayMessage = (alert: AlertRow) => {
    const msg = alert.message;
    const type = (alert.alert_type || "").toLowerCase();
    const combinedSearch = (msg + type).toLowerCase();

    if (combinedSearch.includes("temp") || combinedSearch.includes("fever")) {
      const match = msg.match(/(\d+\.?\d*)/);
      const val = match ? match[0] : null;
      if (val) {
        return `Elevated body temperature recorded at ${val}°C. Value exceeds critical threshold of 40.0°C.`;
      }
      return "Elevated body temperature detected. Value exceeds critical threshold of 40.0°C.";
    }
    if (combinedSearch.includes("ammonia") || combinedSearch.includes("gas")) {
      const match = msg.match(/(\d+)/);
      const val = match ? match[0] : null;
      if (val) {
        return `Critical ammonia concentration. Air quality is below acceptable standards.`;
      }
      return "Critical ammonia levels detected. Air quality has dropped below acceptable standards.";
    }
    if (combinedSearch.includes("humid") || combinedSearch.includes("water")) {
       return "Abnormal humidity levels detected. Exceeds recommended range for pig comfort.";
    }
    return msg;
  };

  const getCalculatedSeverity = (alert: AlertRow): "critical" | "warning" => {
    const type = (alert.alert_type || "").toLowerCase().trim();
    const msg = (alert.message || "").toLowerCase();
    const dbSev = (alert.severity || "").toLowerCase().trim();
    
    if (type.includes("ammonia") || msg.includes("ammonia")) return "critical";
    if (type.includes("temp") || msg.includes("fever") || msg.includes("hot")) return "critical";
    if (dbSev.includes("critical") || dbSev.includes("high") || dbSev.includes("severe") || dbSev.includes("danger")) return "critical";
    return "warning";
  };

  const getFilteredAlerts = () => {
    if (activeFilter === "all") return alerts;
    return alerts.filter((a) => {
      const severity = getCalculatedSeverity(a);
      return severity === activeFilter;
    });
  };

  const getAlertConfig = (alert: AlertRow) => {
    const searchString = `${alert.alert_type || ""} ${alert.message || ""}`.toLowerCase();
    const severity = getCalculatedSeverity(alert);

    const configs: Record<string, any> = {
      ammonia: { icon: "flask", title: "Critical Ammonia Level", color: "#B91C1C", bgColor: "#FEF2F2", iconColor: "#fff", iconBg: "#EF4444" },
      temperature: { icon: "thermometer", title: "High Temperature Detected", color: "#9A3412", bgColor: "#FFF7ED", iconColor: "#fff", iconBg: "#F97316" },
      humidity: { icon: "water", title: "Humidity Issue", color: "#075985", bgColor: "#F0F9FF", iconColor: "#fff", iconBg: "#0EA5E9" },
      feed: { icon: "restaurant", title: "Feed Reminder", color: "#1F2937", bgColor: "#F9FAFB", iconColor: "#fff", iconBg: "#6B7280" },
      default: { icon: "information-circle", title: "System Notification", color: "#166534", bgColor: "#DCFCE7", iconColor: "#fff", iconBg: "#22C55E" },
    };

    if (searchString.includes("ammonia") || searchString.includes("gas")) return configs.ammonia;
    if (searchString.includes("temp") || searchString.includes("fever") || searchString.includes("heat")) return configs.temperature;
    if (searchString.includes("humid") || searchString.includes("water")) return configs.humidity;
    if (searchString.includes("feed") || searchString.includes("food")) return configs.feed;
    if (severity === "critical") {
      return { icon: "alert-circle", title: "Critical Alert", color: "#B91C1C", bgColor: "#FEF2F2", iconColor: "#fff", iconBg: "#EF4444" };
    }
    return configs.default;
  };

  const getInstructions = (alert: AlertRow) => {
    const searchString = `${alert.alert_type || ""} ${alert.message || ""}`.toLowerCase();
    const instructionsMap: Record<string, string[]> = {
      ammonia: ["Clean the pen and remove manure immediately.", "Wash down the floor to reduce the smell.", "Ensure air can flow freely (remove obstructions)."],
      temperature: ["Bathe or mist the pigs with water to cool them.", "Refill the drinking trough with fresh water.", "Check pigs for loss of appetite or lethargy."],
      humidity: ["Scrape standing water off the floor.", "Fix any leaking nipple drinkers or pipes.", "Improve air circulation to dry the pen."],
      default: ["Review the notification details.", "Monitor the system status."],
    };

    if (searchString.includes("ammonia")) return instructionsMap.ammonia;
    if (searchString.includes("temp") || searchString.includes("fever")) return instructionsMap.temperature;
    if (searchString.includes("humid")) return instructionsMap.humidity;
    return instructionsMap.default;
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const renderFilterButton = (label: string, value: FilterType) => {
    const isActive = activeFilter === value;
    return (
      <TouchableOpacity
        style={[styles.filterButton, isActive && styles.filterButtonActive]}
        onPress={() => setActiveFilter(value)}
        activeOpacity={0.7}
      >
        <Text style={[styles.filterText, isActive && styles.filterTextActive]}>
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  const renderAlertCard = (alert: AlertRow, index: number) => {
    const config = getAlertConfig(alert);
    const instructions = getInstructions(alert);
    const isExpanded = expandedAlert === alert.id;
    const displayMessage = formatDisplayMessage(alert);
    const isFirst = index === 0;

    return (
      <TouchableOpacity
        key={alert.id}
        style={[styles.card, { backgroundColor: config.bgColor }]}
        activeOpacity={0.8}
        onPress={() => toggleExpanded(alert.id)}
      >
        <View style={styles.cardHeader}>
          <View style={styles.row}>
            <View style={[styles.iconBase, { backgroundColor: config.iconBg }]}>
              <Ionicons name={config.icon as any} size={20} color={config.iconColor} />
            </View>
            <View style={styles.headerTextContainer}>
              <Text style={[styles.cardTitle, { color: config.color }]}>{config.title}</Text>
              <Text style={[styles.timeText, { color: config.color, opacity: 0.8 }]}>{formatTime(alert.ts)}</Text>
            </View>
          </View>
        </View>

        <View style={styles.whiteDivider} />
        <Text style={[styles.message, { color: config.color }]}>{displayMessage}</Text>

        {isExpanded && (
          <View style={styles.instructionsContainer}>
            <View style={[styles.internalDivider, { backgroundColor: config.color, opacity: 0.1 }]} />
            <Text style={[styles.instructionTitle, { color: config.color }]}>Recommended Actions:</Text>
            {instructions.map((instruction, idx) => (
              <View key={idx} style={styles.instructionRow}>
                <Ionicons name="checkmark-circle-outline" size={14} color={config.color} style={{ marginTop: 2, opacity: 0.7 }} />
                <Text style={[styles.bulletText, { color: config.color }]}>{instruction}</Text>
              </View>
            ))}
          </View>
        )}

        <View style={styles.cardFooter}>
          {isFirst ? (
            <TourGuideZone
              zone={3}
              text="Tap 'View Details' to expand recommended actions."
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }} collapsable={false}>
                <Text style={[styles.seeMoreText, { color: config.color }]}>{isExpanded ? "Hide Details" : "View Details"}</Text>
                <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={config.color} style={{ marginLeft: 4, marginTop: 1 }} />
              </View>
            </TourGuideZone>
          ) : (
            <>
              <Text style={[styles.seeMoreText, { color: config.color }]}>{isExpanded ? "Hide Details" : "View Details"}</Text>
              <Ionicons name={isExpanded ? "chevron-up" : "chevron-down"} size={14} color={config.color} style={{ marginLeft: 4, marginTop: 1 }} />
            </>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const filteredAlerts = getFilteredAlerts();

  const firstBatch = filteredAlerts.slice(0, 2);
  const restBatch = filteredAlerts.slice(2); 

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <View style={{ width: 60, height: 55 }}>
              <Image source={require("../../assets/images/swinetrack-logo.png")} style={{ width: '100%', height: '100%', resizeMode: 'contain' }} />
          </View>

          <TourGuideZone
            zone={4}
            text="Tap this button anytime to replay this tutorial."
            shape="circle"
          >
            <TouchableOpacity onPress={() => start()} style={{ padding: 5 }}>
               <Ionicons name="information-circle-outline" size={28} color="#fff" />
            </TouchableOpacity>
          </TourGuideZone>
        </View>

        <Text style={styles.welcomeText}>Notifications</Text>
        <Text style={styles.subText}>Stay updated on critical system events.</Text>
        <View style={styles.divider} />
      </View>

      <View style={styles.filterContainer}>
        <TourGuideZone
          zone={1}
          text="Use these buttons to filter alerts by severity (Critical, Warning, or All)."
          borderRadius={23}
        >
            <View style={styles.filterWrapper} collapsable={false}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
                    {renderFilterButton("All", "all")}
                    {renderFilterButton("Critical", "critical")}
                    {renderFilterButton("Warning", "warning")}
                </ScrollView>
            </View>
        </TourGuideZone>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: 40 + insets.bottom }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#487307"]} />}
      >
        {loading ? (
          <ActivityIndicator size="large" color="#487307" style={{ marginTop: 50 }} />
        ) : filteredAlerts.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="checkmark-done-circle-outline" size={64} color="#CBD5E1" />
            <Text style={styles.emptyText}>{activeFilter === 'all' ? "All Caught Up!" : `No ${activeFilter} alerts`}</Text>
            <Text style={styles.emptySubText}>
              {activeFilter === 'all' ? "No new alerts at this time." : `You have no ${activeFilter} alerts right now.`}
            </Text>
          </View>
        ) : (
          <>
            {firstBatch.length > 0 && (
              <TourGuideZone
                zone={2}
                text="These are your recent alerts. Review the severity and time."
                borderRadius={16}
              >
                <View collapsable={false}>
                  {firstBatch.map((alert, index) => renderAlertCard(alert, index))}
                </View>
              </TourGuideZone>
            )}

            {restBatch.map((alert, index) => renderAlertCard(alert, index + 2))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

export default function AlertsScreen() {
  return (
    <TourGuideProvider
      preventOutsideInteraction
      backdropColor="rgba(0, 0, 0, 0.7)"
      tooltipStyle={{ borderRadius: 12, paddingTop: 10 }}
      
      androidStatusBarVisible={true} 
      
      labels={{
        previous: "Back",
        next: "Next",
        skip: "Skip",
        finish: "Done",
      }}
    >
      <AlertsScreenContent />
    </TourGuideProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: { backgroundColor: "#487307", paddingTop: 30, paddingBottom: 30, paddingHorizontal: 20, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  welcomeText: { fontSize: 25, fontWeight: "bold", color: "#fff", marginTop: 2, marginLeft: 15 },
  subText: { fontSize: 14, color: "#d8f2c1", marginTop: 4, marginLeft: 15 },
  divider: { height: 1, backgroundColor: "#fff", marginTop: 12, opacity: 0.5 },
  
  filterContainer: { marginTop: 20, paddingBottom: 5, paddingHorizontal: 16, height: 50 },
  filterWrapper: { flexDirection: 'row', width: '100%' },
  filterScroll: { alignItems: 'center', paddingRight: 20 },
  
  filterButton: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, backgroundColor: "#f5f5f5", marginRight: 10, borderWidth: 1, borderColor: "transparent" },
  filterButtonActive: { backgroundColor: "#487307", borderColor: "#365E05" },
  filterText: { fontSize: 14, fontWeight: "600", color: "#64748B" },
  filterTextActive: { color: "#FFFFFF" },
  
  content: { padding: 16, paddingBottom: 40 },
  card: { borderRadius: 16, padding: 16, marginBottom: 12, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 0 },
  row: { flexDirection: "row", alignItems: "center", flex: 1 },
  iconBase: { width: 36, height: 36, borderRadius: 10, justifyContent: "center", alignItems: "center", marginRight: 12 },
  headerTextContainer: { flex: 1 },
  cardTitle: { fontWeight: "700", fontSize: 15, marginBottom: 2 },
  timeText: { fontSize: 12, fontWeight: "500" },
  whiteDivider: { height: 1.5, width: "100%", backgroundColor: "#FFFFFF", opacity: 0.6, marginTop: 10, marginBottom: 10, borderRadius: 1 },
  message: { fontSize: 14, lineHeight: 20, marginLeft: 48, marginBottom: 4, fontWeight: "400" },
  internalDivider: { height: 1, width: "100%", marginVertical: 12 },
  instructionsContainer: { marginTop: 4, marginLeft: 8, marginRight: 8 },
  instructionTitle: { fontWeight: "700", fontSize: 13, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  instructionRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 6 },
  bulletText: { fontSize: 13, marginLeft: 8, flex: 1, lineHeight: 18 },
  cardFooter: { flexDirection: "row", justifyContent: "center", alignItems: "center", marginTop: 12, paddingTop: 8 },
  seeMoreText: { fontWeight: "600", fontSize: 12 },
  emptyContainer: { alignItems: "center", marginTop: 80 },
  emptyText: { fontSize: 18, fontWeight: "600", color: "#64748B", marginTop: 16 },
  emptySubText: { fontSize: 14, color: "#94A3B8", marginTop: 8 },
});