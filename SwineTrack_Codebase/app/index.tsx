import { Session } from "@supabase/supabase-js";
import { useFonts } from "expo-font";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  AppState,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { supabase } from "@/lib/supabase";

AppState.addEventListener("change", (state) => {
  if (state === "active") {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

export default function WelcomePage() {
  const [session, setSession] = useState<Session | null>(null);
  const router = useRouter();

  const [fontsLoaded] = useFonts({
    "Poppins-Regular": require("../assets/fonts/Poppins-Regular.ttf"),
    "Poppins-Bold": require("../assets/fonts/Poppins-Bold.ttf"),
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const logoOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const bottomOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(logoOpacity, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true,
    }).start(() => {
      Animated.timing(contentOpacity, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start(() => {
        Animated.timing(bottomOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }).start();
      });
    });
  }, []);

  if (!fontsLoaded) return null;

  return (
    <View style={styles.container}>
      <View style={styles.topContent}>
        <Animated.Image
          source={require("../assets/images/swinetrack-logo.png")}
          style={[styles.logo, { opacity: logoOpacity }]}
        />

        <Animated.View style={{ opacity: contentOpacity }}>
          <Text style={styles.appName}>
            <Text style={styles.orangeText}>Swine</Text>
            <Text style={styles.greenText}>Track</Text>
          </Text>
          <Text style={styles.tagline}>Right On Time, Healthy Swine</Text>
        </Animated.View>
      </View>

      <Animated.View style={[styles.bottomSection, { opacity: bottomOpacity }]}>
        <TouchableOpacity
          style={styles.createAccountButton}
          onPress={() => router.replace("/(tabs)")}
        >
          <Text style={styles.createAccountText}>Go to Dashboard</Text>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
    justifyContent: "space-between",
  },
  topContent: {
    alignItems: "center",
    marginTop: 200,
  },
  logo: {
    width: 300,
    height: 190,
    resizeMode: "contain",
    tintColor: "#487307",
  },
  appName: {
    fontSize: 40,
    marginBottom: -5,
    textAlign: "center",
    fontFamily: "Poppins-Bold",
  },
  orangeText: {
    color: "#F5A623",
    fontFamily: "Poppins-Bold",
  },
  greenText: {
    color: "#467C1D",
    fontFamily: "Poppins-Bold",
  },
  tagline: {
    fontSize: 17,
    fontStyle: "italic",
    color: "#333",
    textAlign: "center",
    fontFamily: "Poppins-Regular",
  },
  bottomSection: {
    backgroundColor: "#487307",
    padding: 30,
    paddingBottom: 50,
    paddingTop: 70,
    borderTopLeftRadius: 50,
    borderTopRightRadius: 50,
    alignItems: "center",
  },
  signInButton: {
    width: "100%",
    borderWidth: 2,
    borderColor: "#fff",
    paddingVertical: 14,
    borderRadius: 20,
    marginBottom: 15,
    alignItems: "center",
  },
  signInText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Poppins-Bold",
  },
  createAccountButton: {
    width: "100%",
    backgroundColor: "#fff",
    paddingVertical: 14,
    borderRadius: 20,
    alignItems: "center",
  },
  createAccountText: {
    color: "#467C1D",
    fontSize: 16,
    fontFamily: "Poppins-Bold",
  },
});