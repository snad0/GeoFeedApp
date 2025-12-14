// App.js
import { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Image, ScrollView, Linking
} from 'react-native';
import {
  onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from 'firebase/auth';
import {
  NavigationContainer, useFocusEffect
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import Slider from '@react-native-community/slider';
import { auth, db } from './firebase';
import {
  doc, setDoc, getDoc, deleteDoc,
  collection, addDoc, onSnapshot, getDocs,
  query, where, orderBy, limit,
  writeBatch, updateDoc, collectionGroup
} from 'firebase/firestore';

/* ---------------- Cloudinary (unsigned) ---------------- */
const CLOUD_NAME = 'dcdofd4ai';
const PRESET_PROFILES = 'geofeed_profiles_unsigned';
const PRESET_JOBS = 'geofeed_jobs_unsigned';
const PRESET_COMPLETIONS = 'geofeed_completions_unsigned';

async function uploadToCloudinary(uri, preset) {
  const form = new FormData();
  form.append('file', { uri, type: 'image/jpeg', name: 'upload.jpg' });
  form.append('upload_preset', preset);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || 'Cloudinary upload failed');
  return json.secure_url;
}

/* ---------------- Helpers ---------------- */
function kmBetween(a, b) {
  if (!a || !b) return Infinity;
  const toRad = (x) => (x * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const PROFESSION_OPTIONS = [
  'Delivery','Plumber','Electrician','Carpenter','Cleaner','Tutor',
  'Mechanic','Driver','Gardener','Cook','Babysitter','Nurse',
  'IT Support','Web Developer','Designer','Data Entry','Other'
];

const Stack = createNativeStackNavigator();

/* ===================== App Root ===================== */
export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);
  const [coords, setCoords] = useState(null);
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        try {
          const snap = await getDoc(doc(db, 'users', u.uid));
          if (snap.exists()) setProfile(snap.data());
        } catch {}
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status === 'granted') {
            const loc = await Location.getCurrentPositionAsync({});
            setCoords(loc.coords);
          }
        } catch {}
      } else {
        setProfile(null);
        setCoords(null);
      }
      if (initializing) setInitializing(false);
    });
    return unsub;
  }, [initializing]);

  const saveProfileToCloud = async ({
    displayName, about, photoUri,
    professions = [],
    employmentStatus = 'other',
    organizationName = ''
  }) => {
    if (!user) throw new Error('Not signed in');
    try {
      let photoUrl = profile?.photoUrl || null;
      if (photoUri && !/^https?:\/\//i.test(photoUri)) {
        photoUrl = await uploadToCloudinary(photoUri, PRESET_PROFILES);
      } else if (photoUri) {
        photoUrl = photoUri;
      }

      const payload = {
        displayName,
        about,
        photoUrl: photoUrl || null,
        email: user.email || null,
        lastKnownCoords: coords || null,
        professions,
        employmentStatus,
        organizationName,
        isVerified: !!profile?.isVerified || false,
        updatedAt: new Date().toISOString(),
      };

      await setDoc(doc(db, 'users', user.uid), payload, { merge: true });
      const snap = await getDoc(doc(db, 'users', user.uid));
      if (snap.exists()) setProfile(snap.data());
      return true;
    } catch (err) {
      console.error('saveProfileToCloud failed:', err);
      throw err;
    }
  };

  if (initializing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={{ marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {user ? (
          <>
            <Stack.Screen
              name="Home"
              options={({ navigation }) => ({
                headerTitle: 'GeoFeedApp',
                headerTitleAlign: 'left',
                headerTitleStyle: { fontWeight: '700', color: '#0066cc' },
                headerRight: () => (
                  <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
                    <Image
                      source={
                        profile?.photoUrl
                          ? { uri: profile.photoUrl }
                          : require('./assets/profile-placeholder.png')
                      }
                      style={{ width: 32, height: 32, borderRadius: 16, marginRight: 10 }}
                    />
                  </TouchableOpacity>
                ),
              })}
            >
              {(props) => <HomeScreen {...props} userUid={user.uid} />}
            </Stack.Screen>

            <Stack.Screen name="CreateJob" options={{ headerTitle: 'Create Job' }}>
              {(props) => (
                <CreateJobScreen
                  {...props}
                  currentCoords={coords}
                  userUid={user.uid}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="MyJobs" options={{ headerTitle: 'My Jobs' }}>
              {(props) => <MyJobsScreen {...props} userUid={user.uid} />}
            </Stack.Screen>

            <Stack.Screen name="ViewJobs" options={{ headerTitle: 'Jobs' }}>
              {(props) => (
                <ViewJobsScreen
                  {...props}
                  userUid={user.uid}
                  viewerCoords={coords}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="JobDetail" options={{ headerTitle: 'Job' }}>
              {(props) => <JobDetailScreen {...props} userUid={user.uid} />}
            </Stack.Screen>

            <Stack.Screen name="Profile" options={{ headerTitle: 'Profile' }}>
              {(props) => (
                <ProfileScreen
                  {...props}
                  user={user}
                  coords={coords}
                  profile={profile}
                  onEdit={() => props.navigation.navigate('EditProfile')}
                  onSignOut={() => signOut(auth)}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="EditProfile" options={{ headerTitle: 'Edit Profile' }}>
              {(props) => (
                <EditProfileScreen
                  {...props}
                  user={user}
                  coords={coords}
                  profile={profile}
                  onSave={async (p) => {
                    await saveProfileToCloud(p);
                    Alert.alert('Saved', 'Your profile was updated.');
                    props.navigation.goBack();
                  }}
                />
              )}
            </Stack.Screen>

            <Stack.Screen name="VerifyProfile" options={{ headerTitle: 'Verify Profile' }} component={VerifyProfileScreen} />
            <Stack.Screen name="UserProfile" options={{ headerTitle: 'Poster Profile' }} component={UserProfileScreen} />
            <Stack.Screen name="MyBids" options={{ headerTitle: 'My Bids' }}>
              {(props) => <MyBidsScreen {...props} userUid={user.uid} />}
            </Stack.Screen>
          </>
        ) : (
          <Stack.Screen name="Login" component={AuthScreen} options={{ headerShown: false }} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

/* ===================== Auth ===================== */
function AuthScreen() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSignIn = async () => {
    if (!email || !pw) return Alert.alert('Missing info', 'Enter email & password');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pw);
    } catch (e) {
      Alert.alert('Login failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async () => {
    if (!email || !pw) return Alert.alert('Missing info', 'Enter email & password');
    if (pw.length < 6) return Alert.alert('Weak password', 'Use at least 6 characters');
    setBusy(true);
    try {
      await createUserWithEmailAndPassword(auth, email.trim(), pw);
    } catch (e) {
      Alert.alert('Register failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.logo}>GeoFeedApp</Text>
      <View style={styles.card}>
        <TextInput placeholder="Email" value={email} onChangeText={setEmail}
          autoCapitalize="none" keyboardType="email-address" style={styles.input} placeholderTextColor="#888" />
        <TextInput placeholder="Password" value={pw} onChangeText={setPw}
          secureTextEntry style={styles.input} placeholderTextColor="#888" />
        <TouchableOpacity style={[styles.button, busy && { opacity: 0.6 }]} onPress={handleSignIn} disabled={busy}>
          <Text style={styles.buttonText}>{busy ? '...' : 'Login'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.buttonOutline, busy && { opacity: 0.6 }]} onPress={handleRegister} disabled={busy}>
          <Text style={styles.buttonOutlineText}>Register</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/* ===================== Home (UPDATED) ===================== */
// HomeScreen.jsx (replace your current HomeScreen)
function HomeScreen({ navigation, userUid }) {
  const [hasAnyJobs, setHasAnyJobs] = useState(false);

  // bidder-side: jobs that were assigned to me
  const [assignedToMe, setAssignedToMe] = useState([]);
  const [loadingAssignedToMe, setLoadingAssignedToMe] = useState(true);

  // poster-side banner
  const [myAssignedAsPoster, setMyAssignedAsPoster] = useState([]);
  const [loadingPoster, setLoadingPoster] = useState(true);

  // open/nearby feed (unchanged)
  const [nearbyJobs, setNearbyJobs] = useState([]);
  const [loadingNearby, setLoadingNearby] = useState(true);

  // show “View My Jobs” if I ever posted
  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const q = query(collection(db, 'jobs'), where('userUid', '==', userUid), limit(1));
        const snap = await getDocs(q);
        if (alive) setHasAnyJobs(!snap.empty);
      })();
      return () => { alive = false; };
    }, [userUid])
  );

  // listen ONLY to jobs where I'm the assigned bidder AND still active (status === 'assigned')
  useEffect(() => {
    const q = query(
      collection(db, 'jobs'),
      where('assignedBidderUid', '==', userUid),
      where('status', '==', 'assigned')
    );
    const unsub = onSnapshot(q, async (snap) => {
      const items = [];
      for (const d of snap.docs) {
        const job = { id: d.id, ...d.data() };
        let bid = null;
        if (job.selectedBidId) {
          try {
            const b = await getDoc(doc(db, 'jobs', job.id, 'bids', job.selectedBidId));
            if (b.exists()) bid = { id: b.id, ...b.data() };
          } catch {}
        }
        items.push({ job, bid });
      }
      // newest first
      items.sort((a, b) => (b.job?.createdAtMillis || 0) - (a.job?.createdAtMillis || 0));
      setAssignedToMe(items);
      setLoadingAssignedToMe(false);
    }, () => setLoadingAssignedToMe(false));
    return () => unsub();
  }, [userUid]);

  // my jobs as POSTER that are assigned (banner)
  useEffect(() => {
    const q = query(
      collection(db, 'jobs'),
      where('userUid', '==', userUid),
      where('status', '==', 'assigned')
    );
    const unsub = onSnapshot(q, async (snap) => {
      const items = [];
      for (const d of snap.docs) {
        const job = { id: d.id, ...d.data() };
        let bid = null, bidder = null;
        if (job.selectedBidId) {
          try {
            const b = await getDoc(doc(db, 'jobs', job.id, 'bids', job.selectedBidId));
            if (b.exists()) {
              bid = { id: b.id, ...b.data() };
              const u = await getDoc(doc(db, 'users', bid.bidderUid));
              if (u.exists()) bidder = u.data();
            }
          } catch {}
        }
        items.push({ job, bid, bidder });
      }
      // soonest deadline first
      items.sort((a, b) => new Date(a.job?.expiresAt || 0) - new Date(b.job?.expiresAt || 0));
      setMyAssignedAsPoster(items);
      setLoadingPoster(false);
    }, () => setLoadingPoster(false));
    return () => unsub();
  }, [userUid]);

  // nearby/open feed (unchanged)
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'jobs'), (snap) => {
      const now = Date.now();
      const rows = [];
      snap.forEach((d) => {
        const j = d.data();
        if (j.userUid === userUid) return;
        if (j.status !== 'open') return;
        if (!j.expiresAt || new Date(j.expiresAt).getTime() <= now) return;
        rows.push({ id: d.id, ...j });
      });
      rows.sort((a, b) => (b.createdAtMillis || 0) - (a.createdAtMillis || 0));
      setNearbyJobs(rows);
      setLoadingNearby(false);
    }, () => setLoadingNearby(false));
    return () => unsub();
  }, [userUid]);

  const bidderBanner = !loadingAssignedToMe && assignedToMe[0] ? assignedToMe[0] : null;
  const posterBanner = !loadingPoster && myAssignedAsPoster[0] ? myAssignedAsPoster[0] : null;
  const showDefaultFeed = !bidderBanner && !posterBanner && !loadingAssignedToMe && !loadingPoster;

  return (
    <View style={{ flex: 1, backgroundColor: '#f5f7fa' }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 140 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#0066cc', marginBottom: 10 }}>
          GeoFeedApp
        </Text>

        {/* Banner for bidder */}
        {bidderBanner && (
          <InfoBanner
            title="You have a job"
            subtitle={`Complete it before ${new Date(bidderBanner.job.expiresAt).toLocaleString()}`}
            onPress={() => navigation.navigate('JobDetail', { jobId: bidderBanner.job.id })}
            tone="success"
            fullPress
          />
        )}

        {/* Banner for poster */}
        {posterBanner && (
          <InfoBanner
            title={`${posterBanner.bidder?.displayName || 'Someone'} is doing your job`}
            subtitle={`Your job will be completed by ${new Date(posterBanner.job.expiresAt).toLocaleString()}`}
            onPress={() => navigation.navigate('JobDetail', { jobId: posterBanner.job.id })}
            tone="info"
          />
        )}

        {/* YOUR ASSIGNED JOBS (active only) */}
        {!loadingAssignedToMe && assignedToMe.length > 0 && (
          <>
            <Text style={{ marginTop: 8, color: '#556' }}>Your assigned jobs</Text>
            {assignedToMe.map(({ job, bid }) => (
              <View key={`${job.id}_${bid?.id || 'sel'}`} style={{ marginTop: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '700', fontSize: 16 }}>{job.category?.toUpperCase() || 'JOB'}</Text>
                  <StatusChip status={job.status} />
                </View>
                {job.imageUrl ? (
                  <Image source={{ uri: job.imageUrl }} style={{ width: '100%', height: 150, borderRadius: 8, marginTop: 8 }} />
                ) : null}
                <Text style={{ marginTop: 8 }}>{job.description}</Text>
                {job.details ? <Text style={{ marginTop: 6, color: '#555' }}>{job.details}</Text> : null}
                {bid ? (
                  <View style={{ marginTop: 10, padding: 10, borderRadius: 8, backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac' }}>
                    <Text style={{ fontWeight: '700', color: '#16a34a' }}>YOUR BID ACCEPTED</Text>
                    <Text style={{ marginTop: 4 }}>Amount: ₹{bid.amount}</Text>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={[styles.buttonOutline, { marginTop: 10 }]}
                  onPress={() => navigation.navigate('JobDetail', { jobId: job.id })}
                >
                  <Text style={styles.buttonOutlineText}>Open Job</Text>
                </TouchableOpacity>
              </View>
            ))}
          </>
        )}

        {/* Default feed when no banners/assigned */}
        {showDefaultFeed && (
          <>
            {loadingNearby ? (
              <View style={[styles.center, { paddingVertical: 20 }]}>
                <ActivityIndicator size="large" color="#0066cc" />
                <Text style={{ marginTop: 8 }}>Loading jobs…</Text>
              </View>
            ) : nearbyJobs.length === 0 ? (
              <View style={[styles.center, { paddingVertical: 20 }]}>
                <Text style={{ color: '#667' }}>No jobs right now.</Text>
                <TouchableOpacity
                  style={[styles.button, { marginTop: 16, paddingHorizontal: 24, alignSelf: 'center' }]}
                  onPress={() => navigation.navigate('ViewJobs')}
                >
                  <Text style={styles.buttonText}>Find Jobs Near Me</Text>
                </TouchableOpacity>
              </View>
            ) : (
              nearbyJobs.map((j) => (
                <View key={j.id} style={{ marginBottom: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 2 }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontWeight: '700', fontSize: 16 }}>{j.category?.toUpperCase() || 'JOB'}</Text>
                    <StatusChip status={j.status} />
                  </View>
                  {j.imageUrl ? (
                    <Image source={{ uri: j.imageUrl }} style={{ width: '100%', height: 160, borderRadius: 8, marginTop: 8 }} />
                  ) : null}
                  <Text style={{ marginTop: 8 }}>{j.description}</Text>
                  {j.details ? <Text style={{ marginTop: 6, color: '#555' }}>{j.details}</Text> : null}
                  <TouchableOpacity
                    style={[styles.buttonOutline, { marginTop: 10 }]}
                    onPress={() => navigation.navigate('JobDetail', { jobId: j.id })}
                  >
                    <Text style={styles.buttonOutlineText}>View & Bid</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* Footer — keep both actions visible */}
      <View style={[styles.footerBar, { paddingBottom: 24 }]}>
        <TouchableOpacity style={[styles.footerBtn, { backgroundColor: '#0066cc' }]}
          onPress={() => navigation.navigate('CreateJob')}>
          <Text style={[styles.footerBtnText, { color: '#fff' }]}>Create Job</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.footerBtn}
          onPress={() => navigation.navigate('ViewJobs')}>
          <Text style={styles.footerBtnText}>View Jobs</Text>
        </TouchableOpacity>

        {hasAnyJobs && (
          <TouchableOpacity style={styles.footerBtn}
            onPress={() => navigation.navigate('MyJobs')}>
            <Text style={styles.footerBtnText}>View My Jobs</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}



/* ===================== Create Job ===================== */
function CreateJobScreen({ navigation, currentCoords, userUid }) {
  const [imageUri, setImageUri] = useState(null);
  const [description, setDescription] = useState('');
  const [details, setDetails] = useState('');
  const [category, setCategory] = useState('other');
  const [minBid, setMinBid] = useState('');
  const [maxBid, setMaxBid] = useState('');
  const [expiresAt, setExpiresAt] = useState(new Date(Date.now() + 60 * 60 * 1000));
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [locChoice, setLocChoice] = useState('current');
  const [address, setAddress] = useState('');
  const [radiusKm, setRadiusKm] = useState(10);

  const pickImage = async () => {
    try {
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo access in Settings.', [
          { text: 'Cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType?.Images ?? ImagePicker.MediaTypeOptions?.Images,
        quality: 0.8, allowsEditing: true, aspect: [4, 3],
      });
      if (!res.canceled) {
        const uri = res.assets?.[0]?.uri;
        if (uri) setImageUri(uri);
      }
    } catch (e) {
      console.error('Image picker error:', e);
      Alert.alert('Image picker error', e?.message ?? String(e));
    }
  };

  const postJob = async () => {
    try {
      if (!imageUri) return Alert.alert('Missing image', 'Please add a job image.');
      if (!description.trim()) return Alert.alert('Missing description', 'Add a short job description.');
      if (!minBid || !maxBid) return Alert.alert('Bid range', 'Enter expected bid range.');
      if (Number(minBid) > Number(maxBid)) return Alert.alert('Bid range', 'Min cannot be greater than Max.');
      if (locChoice === 'custom' && !address.trim()) return Alert.alert('Address required', 'Enter the job address.');

      const imageUrl = await uploadToCloudinary(imageUri, PRESET_JOBS);

      const payload = {
        userUid,
        imageUrl,
        description,
        details,
        category,
        bidRange: { min: Number(minBid), max: Number(maxBid) },
        expiresAt: expiresAt.toISOString(),
        createdAt: new Date().toISOString(),
        createdAtMillis: Date.now(),
        location: locChoice === 'current'
          ? { type: 'current', coords: currentCoords || null }
          : { type: 'custom', address },
        radiusKm,
        status: 'open',
      };

      await addDoc(collection(db, 'jobs'), payload);

      Alert.alert('Job posted', 'Your job is now live.', [
        { text: 'OK', onPress: () => navigation.navigate('Home') },
      ]);
    } catch (e) {
      Alert.alert('Failed to post job', e?.message ?? String(e));
    }
  };

  const onDatePicked = (_, d) => {
    setShowDate(false);
    if (!d) return;
    setExpiresAt((prev) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), prev.getHours(), prev.getMinutes()));
  };
  const onTimePicked = (_, d) => {
    setShowTime(false);
    if (!d) return;
    setExpiresAt((prev) => new Date(prev.getFullYear(), prev.getMonth(), prev.getDate(), d.getHours(), d.getMinutes()));
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      <Section title="Photo">
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={{ width: '100%', height: 180, borderRadius: 10, marginBottom: 10 }} />
        ) : (
          <View style={[styles.placeholderBox, { marginBottom: 10 }]} />
        )}
        <TouchableOpacity style={styles.button} onPress={pickImage}>
          <Text style={styles.buttonText}>{imageUri ? 'Change Image' : 'Add Image'}</Text>
        </TouchableOpacity>
      </Section>

      <Section title="Description">
        <TextInput value={description} onChangeText={setDescription}
          placeholder="Describe the job…" multiline
          style={[styles.input, { height: 100, textAlignVertical: 'top' }]} />
      </Section>

      <Section title="Add Details for job">
        <TextInput value={details} onChangeText={setDetails}
          placeholder="Anything extra the worker should know…" multiline
          style={[styles.input, { height: 120, textAlignVertical: 'top' }]} />
      </Section>

      <Section title="Category">
        <View style={[styles.input, { padding: 0 }]}>
          <Picker selectedValue={category} onValueChange={setCategory}>
            <Picker.Item label="Other" value="other" />
            <Picker.Item label="Delivery" value="delivery" />
            <Picker.Item label="Cleaning" value="cleaning" />
            <Picker.Item label="Repairs" value="repairs" />
            <Picker.Item label="Tutoring" value="tutoring" />
          </Picker>
        </View>
      </Section>

      <Section title="Expected Bid Range">
        <View style={{ flexDirection: 'row' }}>
          <TextInput style={[styles.input, { flex: 1, marginRight: 8 }]}
            value={minBid} onChangeText={setMinBid} placeholder="Min" keyboardType="numeric" />
          <TextInput style={[styles.input, { flex: 1, marginLeft: 8 }]}
            value={maxBid} onChangeText={setMaxBid} placeholder="Max" keyboardType="numeric" />
        </View>
      </Section>

      <Section title="Run Until">
        <View style={{ flexDirection: 'row' }}>
          <TouchableOpacity style={[styles.button, { flex: 1, marginRight: 8 }]} onPress={() => setShowDate(true)}>
            <Text style={styles.buttonText}>{expiresAt.toDateString()}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.buttonOutline, { flex: 1, marginLeft: 8 }]} onPress={() => setShowTime(true)}>
            <Text style={styles.buttonOutlineText}>{expiresAt.toLocaleTimeString()}</Text>
          </TouchableOpacity>
        </View>
        {showDate && <DateTimePicker value={expiresAt} mode="date" onChange={onDatePicked} />}
        {showTime && <DateTimePicker value={expiresAt} mode="time" onChange={onTimePicked} />}
      </Section>

      <Section title="Location">
        <RadioRow label="Use my current location"
          selected={locChoice === 'current'} onPress={() => setLocChoice('current')}
          sublabel={currentCoords ? `${currentCoords.latitude.toFixed(5)}, ${currentCoords.longitude.toFixed(5)}` : 'Not available'} />
        <RadioRow label="Add another location"
          selected={locChoice === 'custom'} onPress={() => setLocChoice('custom')} />
        {locChoice === 'custom' && (
          <TextInput style={styles.input} value={address} onChangeText={setAddress}
            placeholder="Enter address (non-functional for now)" />
        )}
      </Section>

      <Section title="Visibility Radius">
        <Text style={{ marginBottom: 6 }}>Show this job within {radiusKm} km</Text>
        <Slider value={radiusKm} onValueChange={setRadiusKm} minimumValue={1} maximumValue={100} step={1} />
      </Section>

      <TouchableOpacity style={[styles.button, { marginTop: 16 }]} onPress={postJob}>
        <Text style={styles.buttonText}>Post Job</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ===================== My Jobs ===================== */
function MyJobsScreen({ navigation, userUid }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qy = query(
      collection(db, 'jobs'),
      where('userUid', '==', userUid),
      orderBy('createdAtMillis', 'desc')
    );
    const unsub = onSnapshot(qy, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setJobs(arr);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [userUid]);

  const removeJob = async (id) => {
    await deleteDoc(doc(db, 'jobs', id));
    Alert.alert('Job removed', 'Your job has been deleted.');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={{ marginTop: 8 }}>Loading your jobs…</Text>
      </View>
    );
  }

  if (jobs.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No jobs yet</Text>
        <TouchableOpacity style={[styles.button, { marginTop: 12 }]} onPress={() => navigation.navigate('CreateJob')}>
          <Text style={styles.buttonText}>Create Job</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {jobs.map((j) => (
        <View key={j.id} style={{ marginBottom: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
            <Text style={{ fontWeight: '700', fontSize: 16 }}>{j.category?.toUpperCase() || 'JOB'}</Text>
            <StatusChip status={j.status} />
          </View>

          {j.imageUrl ? (
            <Image source={{ uri: j.imageUrl }} style={{ width: '100%', height: 160, borderRadius: 8 }} />
          ) : null}

          <View style={{ marginTop: 10 }}>
            <Text style={{ marginVertical: 6 }}>{j.description}</Text>
            {j.details ? <Text style={{ marginBottom: 6 }}>{j.details}</Text> : null}
            <Text>Bid: ₹{j.bidRange?.min} – ₹{j.bidRange?.max}</Text>
            <Text>Radius: {j.radiusKm} km</Text>
            <Text>Runs until: {new Date(j.expiresAt).toLocaleString()}</Text>
          </View>

          {j.status === 'completed' && j.completionImageUrl ? (
            <View style={{ marginTop: 10 }}>
              <Text style={{ fontWeight: '700', marginBottom: 6 }}>Completion submitted</Text>
              <Image source={{ uri: j.completionImageUrl }} style={{ width: '100%', height: 160, borderRadius: 8 }} />
              <TouchableOpacity
                style={[styles.button, { marginTop: 10 }]}
                onPress={async () => {
                  try {
                    await updateDoc(doc(db, 'jobs', j.id), { status: 'paid', paidAt: new Date().toISOString() });
                    Alert.alert('Payment marked', 'Job marked as paid.');
                  } catch (e) {
                    Alert.alert('Error', e?.message ?? String(e));
                  }
                }}
              >
                <Text style={styles.buttonText}>Mark as Paid</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', marginTop: 10 }}>
            <TouchableOpacity style={[styles.buttonOutline, { flex: 1, marginRight: 8 }]} onPress={() => navigation.navigate('JobDetail', { jobId: j.id })}>
              <Text style={styles.buttonOutlineText}>Manage</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.buttonOutline, { flex: 1, marginLeft: 8 }]} onPress={() => removeJob(j.id)}>
              <Text style={styles.buttonOutlineText}>Delete</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

/* ===================== View Jobs (nearby) ===================== */
function ViewJobsScreen({ navigation, userUid, viewerCoords }) {
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [userMap, setUserMap] = useState({});

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'jobs'), (snap) => {
      const now = Date.now();
      const rows = [];
      snap.forEach((d) => {
        const j = d.data();

        if (j.userUid === userUid) return;
        if (j.status !== 'open') return;
        if (!j.expiresAt || new Date(j.expiresAt).getTime() <= now) return;

        const jobCoords = j.location?.type === 'current' ? j.location?.coords : null;
        if (!jobCoords || !viewerCoords) return;

        const dist = kmBetween(
          { latitude: viewerCoords.latitude, longitude: viewerCoords.longitude },
          { latitude: jobCoords.latitude, longitude: jobCoords.longitude }
        );
        if (Number.isFinite(dist) && typeof j.radiusKm === 'number' && dist <= j.radiusKm) {
          rows.push({ id: d.id, ...j, _distanceKm: dist });
        }
      });

      rows.sort((a, b) => a._distanceKm - b._distanceKm);
      setJobs(rows);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [userUid, viewerCoords]);

  useEffect(() => {
    const missing = [];
    for (const j of jobs) {
      if (j.userUid && !userMap[j.userUid]) missing.push(j.userUid);
    }
    if (missing.length === 0) return;

    (async () => {
      const pairs = await Promise.all(
        missing.map(async (uid) => {
          try {
            const snap = await getDoc(doc(db, 'users', uid));
            return [uid, snap.exists() ? snap.data() : null];
          } catch {
            return [uid, null];
          }
        })
      );
      setUserMap((prev) => ({ ...prev, ...Object.fromEntries(pairs) }));
    })();
  }, [jobs]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!viewerCoords) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Location needed</Text>
        <Text>We couldn’t get your current location, so nearby jobs can’t be shown.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={{ marginTop: 8 }}>Loading nearby jobs…</Text>
      </View>
    );
  }

  if (jobs.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>No nearby jobs right now</Text>
        <Text>Check back later or widen the posting radius.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {jobs.map((j) => {
        const poster = userMap[j.userUid];

        return (
          <View key={j.id} style={{ marginBottom: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
              <View>
                <Image
                  source={poster?.photoUrl ? { uri: poster.photoUrl } : require('./assets/profile-placeholder.png')}
                  style={{ width: 36, height: 36, borderRadius: 18, marginRight: 10 }}
                />
                <View style={{
                  position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 6,
                  backgroundColor: poster?.isVerified ? '#22c55e' : '#cbd5e1', borderWidth: 2, borderColor: '#fff'
                }} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontWeight: '600' }}>{poster?.displayName ?? 'User'}</Text>
                <Text style={{ color: '#666', fontSize: 12 }}>{j._distanceKm.toFixed(1)} km away</Text>
              </View>
              <StatusChip status={j.status} />
            </View>

            {j.imageUrl ? (
              <Image source={{ uri: j.imageUrl }} style={{ width: '100%', height: 180, borderRadius: 8 }} />
            ) : null}

            <View style={{ marginTop: 10 }}>
              <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: 4 }}>
                {j.category?.toUpperCase() || 'JOB'}
              </Text>
              <Text style={{ marginBottom: 6 }}>{j.description}</Text>

              {j.details ? (
                <>
                  <Divider />
                  <LabelValue label="Details" value={j.details} multiline />
                </>
              ) : null}

              <Divider />
              <Text style={{ color: '#333', marginBottom: 4 }}>
                Bid range: ₹{j.bidRange?.min} – ₹{j.bidRange?.max}
              </Text>
              <Text style={{ color: '#333', marginBottom: 4 }}>
                Distance: {j._distanceKm.toFixed(1)} km (visible ≤ {j.radiusKm} km)
              </Text>
              <Text style={{ color: '#666' }}>
                Runs until: {new Date(j.expiresAt).toLocaleString()}
              </Text>

              <TouchableOpacity
                style={[styles.buttonOutline, { marginTop: 12 }]}
                onPress={() => navigation.navigate('JobDetail', { jobId: j.id })}
              >
                <Text style={styles.buttonOutlineText}>View & Bid</Text>
              </TouchableOpacity>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

/* ===================== Job Detail (view + bid + manage + completion) ===================== */
function JobDetailScreen({ route, navigation, userUid }) {
  const { jobId } = route.params;
  const [job, setJob] = useState(null);
  const [poster, setPoster] = useState(null);
  const [loading, setLoading] = useState(true);

  const [myBid, setMyBid] = useState(null);
  const [bids, setBids] = useState([]);

  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');

  // Load job
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'jobs', jobId),
      (snap) => {
        if (snap.exists()) setJob({ id: snap.id, ...snap.data() });
        else setJob(null);
        setLoading(false);
      },
      (err) => { console.warn('Job listener error:', err); setLoading(false); }
    );
    return () => unsub();
  }, [jobId]);

  // Load poster profile
  useEffect(() => {
    if (!job?.userUid) return;
    (async () => {
      const s = await getDoc(doc(db, 'users', job.userUid));
      setPoster(s.exists() ? s.data() : null);
    })();
  }, [job?.userUid]);

  // Listen to my own bid (only if I'm NOT the owner)
  useEffect(() => {
    if (!job) return;
    if (job.userUid === userUid) return; // owner doesn't have "my bid"
    const qy = query(
      collection(db, 'jobs', jobId, 'bids'),
      where('bidderUid', '==', userUid),
      limit(1)
    );
    const unsub = onSnapshot(qy, (snap) => {
      if (!snap.empty) setMyBid({ id: snap.docs[0].id, ...snap.docs[0].data() });
      else setMyBid(null);
    });
    return () => unsub();
  }, [job, jobId, userUid]);

  // Listen to bids (only if I'm the owner)
  useEffect(() => {
    if (!job) return;
    if (job.userUid !== userUid) return; // not owner
    const qy = query(collection(db, 'jobs', jobId, 'bids'), orderBy('createdAtMillis', 'asc'));
    const unsub = onSnapshot(qy, (snap) => {
      const arr = [];
      snap.forEach((d) => arr.push({ id: d.id, ...d.data() }));
      setBids(arr);
    }, (err) => {
      console.warn('Bids listener error:', err);
      Alert.alert('Permissions', 'You do not have access to see bids for this job.');
    });
    return () => unsub();
  }, [job, jobId, userUid]);

  const placeBid = async () => {
    if (!amount) return Alert.alert('Missing amount', 'Enter your bid amount.');
    const amt = Number(amount);
    if (!(amt > 0)) return Alert.alert('Invalid', 'Amount must be a positive number.');
    if (job.userUid === userUid) return Alert.alert('Not allowed', 'You cannot bid on your own job.');

    try {
      await addDoc(collection(db, 'jobs', jobId, 'bids'), {
        bidderUid: userUid,
        amount: amt,
        message: message.trim() || '',
        status: 'pending',
        createdAt: new Date().toISOString(),
        createdAtMillis: Date.now(),
      });
      setAmount('');
      setMessage('');
      Alert.alert('Bid placed', 'Your bid has been submitted.');
    } catch (e) {
      Alert.alert('Failed', e?.message ?? String(e));
    }
  };

  const acceptBid = async (bidId) => {
    try {
      const bidSnap = await getDoc(doc(db, 'jobs', jobId, 'bids', bidId));
      const bid = bidSnap.exists() ? bidSnap.data() : null;
      if (!bid) return Alert.alert('Error', 'Bid not found');

      const batch = writeBatch(db);
      batch.update(doc(db, 'jobs', jobId, 'bids', bidId), { status: 'accepted' });
      const snap = await getDocs(collection(db, 'jobs', jobId, 'bids'));
      snap.forEach((d) => {
        if (d.id !== bidId && d.data()?.status !== 'rejected') {
          batch.update(d.ref, { status: 'rejected' });
        }
      });
      batch.update(doc(db, 'jobs', jobId), {
        status: 'assigned',
        selectedBidId: bidId,
        assignedBidderUid: bid.bidderUid,
        assignedAt: new Date().toISOString(),
      });
      await batch.commit();
      Alert.alert('Bid accepted', 'This job is now assigned.');
    } catch (e) {
      Alert.alert('Error', e?.message ?? String(e));
    }
  };

  const rejectBid = async (bidId) => {
    try {
      await updateDoc(doc(db, 'jobs', jobId, 'bids', bidId), { status: 'rejected' });
    } catch (e) {
      Alert.alert('Error', e?.message ?? String(e));
    }
  };

  const markDone = async () => {
    try {
      if (!myBid || myBid.status !== 'accepted') return;
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo access in Settings.', [
          { text: 'Cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType?.Images ?? ImagePicker.MediaTypeOptions?.Images,
        quality: 0.9, allowsEditing: true, aspect: [4, 3],
      });
      if (res.canceled) return;
      const uri = res.assets?.[0]?.uri;
      if (!uri) return;

      const url = await uploadToCloudinary(uri, PRESET_COMPLETIONS);
      await updateDoc(doc(db, 'jobs', jobId), {
        status: 'completed',
        completedAt: new Date().toISOString(),
        completionImageUrl: url,
        completedBy: userUid,
      });
      Alert.alert('Submitted', 'Completion submitted to the poster.');
    } catch (e) {
      Alert.alert('Error', e?.message ?? String(e));
    }
  };

  const markPaid = async () => {
    try {
      await updateDoc(doc(db, 'jobs', jobId), { status: 'paid', paidAt: new Date().toISOString() });
    } catch (e) {
      Alert.alert('Error', e?.message ?? String(e));
    }
  };

  if (loading || !job) {
    return (
      <View style={styles.center}>
        {loading ? <>
          <ActivityIndicator size="large" color="#0066cc" />
          <Text style={{ marginTop: 8 }}>Loading…</Text>
        </> : <Text style={styles.title}>Job not found</Text>}
      </View>
    );
  }

  const isOwner = job.userUid === userUid;

  const mineBanner = (!isOwner && myBid) ? (
    <View style={{ padding: 10, borderRadius: 8, marginBottom: 10,
      backgroundColor:
        myBid.status === 'accepted' ? '#dcfce7' :
        myBid.status === 'rejected' ? '#fee2e2' : '#fff7ed',
      borderWidth: 1,
      borderColor:
        myBid.status === 'accepted' ? '#86efac' :
        myBid.status === 'rejected' ? '#fecaca' : '#fed7aa'
    }}>
      <Text style={{
        fontWeight: '700',
        color:
          myBid.status === 'accepted' ? '#16a34a' :
          myBid.status === 'rejected' ? '#dc2626' : '#b45309',
        fontSize: 16
      }}>
        {myBid.status === 'accepted' ? 'YOUR BID ACCEPTED' :
         myBid.status === 'rejected' ? 'BID REJECTED' : 'BID PENDING'}
      </Text>
      <Text style={{ marginTop: 4 }}>₹{myBid.amount}</Text>
      {myBid.message ? <Text style={{ marginTop: 2, color: '#555' }}>{myBid.message}</Text> : null}
    </View>
  ) : null;

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {/* Poster header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Image
          source={poster?.photoUrl ? { uri: poster.photoUrl } : require('./assets/profile-placeholder.png')}
          style={{ width: 40, height: 40, borderRadius: 20, marginRight: 10 }}
        />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700' }}>{poster?.displayName ?? 'User'}</Text>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('UserProfile', { userUid: job.userUid })}>
          <Text style={{ color: '#0066cc', fontWeight: '600' }}>View poster</Text>
        </TouchableOpacity>
      </View>

      {job.imageUrl ? (
        <Image source={{ uri: job.imageUrl }} style={{ width: '100%', height: 200, borderRadius: 10, marginBottom: 10 }} />
      ) : null}

      <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 2 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: 6 }}>{job.category?.toUpperCase() || 'JOB'}</Text>
          <StatusChip status={job.status} />
        </View>
        <Text style={{ marginBottom: 6 }}>{job.description}</Text>
        {job.details ? <>
          <Divider />
          <LabelValue label="Details" value={job.details} multiline />
        </> : null}
        <Divider />
        <Text>Bid range: ₹{job.bidRange?.min} – ₹{job.bidRange?.max}</Text>
        <Text style={{ marginTop: 4, color: '#666' }}>Runs until: {new Date(job.expiresAt).toLocaleString()}</Text>
      </View>

      {mineBanner}

      {job.status === 'completed' && job.completionImageUrl ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: '700', marginBottom: 6 }}>Completion photo</Text>
          <Image source={{ uri: job.completionImageUrl }} style={{ width: '100%', height: 200, borderRadius: 10 }} />
        </View>
      ) : null}

      {!isOwner && job.status === 'open' && (
        <View style={{ marginTop: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 2 }}>
          <Text style={{ fontWeight: '700', marginBottom: 8 }}>Place your bid</Text>
          <TextInput
            value={amount}
            onChangeText={setAmount}
            placeholder="Amount (₹)"
            keyboardType="numeric"
            style={styles.input}
          />
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Message (optional)"
            multiline
            style={[styles.input, { height: 90, textAlignVertical: 'top' }]}
          />
          <TouchableOpacity style={styles.button} onPress={placeBid}>
            <Text style={styles.buttonText}>Submit Bid</Text>
          </TouchableOpacity>
        </View>
      )}

      {!isOwner && myBid?.status === 'accepted' && (job.status === 'assigned' || !job.completedAt) && (
        <TouchableOpacity style={[styles.button, { marginTop: 16 }]} onPress={markDone}>
          <Text style={styles.buttonText}>Mark as Done (add photo)</Text>
        </TouchableOpacity>
      )}

      {isOwner && job.status === 'completed' && (
        <TouchableOpacity style={[styles.button, { marginTop: 16 }]} onPress={markPaid}>
          <Text style={styles.buttonText}>Mark as Paid</Text>
        </TouchableOpacity>
      )}

      {isOwner && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontWeight: '700', marginBottom: 8 }}>Bids received</Text>
          {bids.length === 0 ? (
            <View style={[styles.center, { backgroundColor: '#fff', padding: 16, borderRadius: 12 }]}>
              <Text>No bids yet</Text>
            </View>
          ) : (
            bids.map((b) => (
              <View key={b.id} style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 10, elevation: 2 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontWeight: '600' }}>₹{b.amount}</Text>
                  <Text style={{ color: '#666' }}>Status: {b.status}</Text>
                </View>

                {b.message ? <Text style={{ color: '#555', marginTop: 6 }}>{b.message}</Text> : null}

                <View style={{ flexDirection: 'row', marginTop: 12 }}>
                  {b.status !== 'accepted' && job.status === 'open' && (
                    <TouchableOpacity
                      style={[styles.button, { flex: 1, marginRight: 8 }]}
                      onPress={() => acceptBid(b.id)}
                    >
                      <Text style={styles.buttonText}>Accept</Text>
                    </TouchableOpacity>
                  )}

                  {b.status === 'pending' && job.status === 'open' && (
                    <TouchableOpacity
                      style={[styles.buttonOutline, { flex: 1, marginLeft: 8 }]}
                      onPress={() => rejectBid(b.id)}
                    >
                      <Text style={styles.buttonOutlineText}>Reject</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* View bidder’s profile + history */}
                <TouchableOpacity
                  style={[styles.buttonOutline, { marginTop: 10 }]}
                  onPress={() => navigation.navigate('UserProfile', { userUid: b.bidderUid })}
                >
                  <Text style={styles.buttonOutlineText}>View bidder</Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>
      )}
    </ScrollView>
  );
}

/* ===================== My Bids ===================== */
function MyBidsScreen({ navigation, userUid }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const qy = query(
      collectionGroup(db, 'bids'),
      where('bidderUid', '==', userUid),
      orderBy('createdAtMillis', 'desc')
    );
    const unsub = onSnapshot(qy, async (snap) => {
      const items = [];
      for (const d of snap.docs) {
        const bid = { id: d.id, ...d.data() };
        const jobRef = d.ref.parent.parent;
        let job = null;
        try {
          const js = await getDoc(jobRef);
          if (js.exists()) job = { id: js.id, ...js.data() };
        } catch {}
        items.push({ bid, job });
      }
      setRows(items);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, [userUid]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={{ marginTop: 8 }}>Loading your bids…</Text>
      </View>
    );
  }

  if (rows.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>You haven’t placed any bids yet</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }}>
      {rows.map(({ bid, job }) => (
        <View key={bid.id} style={{ marginBottom: 16, backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 2 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={{ fontWeight: '700', fontSize: 16 }}>{job?.category?.toUpperCase() || 'JOB'}</Text>
            {job ? <StatusChip status={job.status} /> : null}
          </View>
          {job?.imageUrl ? (
            <Image source={{ uri: job.imageUrl }} style={{ width: '100%', height: 140, borderRadius: 8, marginTop: 8 }} />
          ) : null}
          <Text style={{ marginTop: 8 }}>{job?.description || '(Job unavailable)'}</Text>

          <View style={{
            marginTop: 10, padding: 10, borderRadius: 8,
            backgroundColor:
              bid.status === 'accepted' ? '#dcfce7' :
              bid.status === 'rejected' ? '#fee2e2' : '#fff7ed',
            borderWidth: 1,
            borderColor:
              bid.status === 'accepted' ? '#86efac' :
              bid.status === 'rejected' ? '#fecaca' : '#fed7aa'
          }}>
            <Text style={{
              fontWeight: '700',
              color:
                bid.status === 'accepted' ? '#16a34a' :
                bid.status === 'rejected' ? '#dc2626' : '#b45309'
            }}>
              {bid.status === 'accepted' ? 'YOUR BID ACCEPTED' :
               bid.status === 'rejected' ? 'BID REJECTED' : 'BID PENDING'}
            </Text>
            <Text style={{ marginTop: 4 }}>₹{bid.amount}</Text>
            {bid.message ? <Text style={{ marginTop: 2, color: '#555' }}>{bid.message}</Text> : null}
          </View>

          <TouchableOpacity
            style={[styles.buttonOutline, { marginTop: 10 }]}
            onPress={() => job ? navigation.navigate('JobDetail', { jobId: job.id }) : null}
            disabled={!job}
          >
            <Text style={styles.buttonOutlineText}>Open Job</Text>
          </TouchableOpacity>
        </View>
      ))}
    </ScrollView>
  );
}

/* ===================== Public Poster/Bidder Profile (with history) ===================== */
function UserProfileScreen({ route }) {
  const { userUid } = route.params;
  const [u, setU] = useState(null);
  const [loading, setLoading] = useState(true);

  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'users', userUid));
        setU(snap.exists() ? snap.data() : null);
      } finally {
        setLoading(false);
      }
    })();
  }, [userUid]);

  useEffect(() => {
    const qy = query(collection(db, 'jobs'), where('assignedBidderUid', '==', userUid));
    const unsub = onSnapshot(qy, (snap) => {
      const rows = [];
      snap.forEach((d) => {
        const j = { id: d.id, ...d.data() };
        if (j.status === 'completed' || j.status === 'paid') rows.push(j);
      });
      rows.sort((a, b) => {
        const at = new Date(a.paidAt || a.completedAt || a.expiresAt || 0).getTime();
        const bt = new Date(b.paidAt || b.completedAt || b.expiresAt || 0).getTime();
        return bt - at;
      });
      setHistory(rows);
      setLoadingHistory(false);
    }, () => setLoadingHistory(false));
    return () => unsub();
  }, [userUid]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={{ marginTop: 8 }}>Loading profile…</Text>
      </View>
    );
  }

  if (!u) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Profile not found</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <View style={{ alignItems: 'center', marginTop: 10 }}>
        <View>
          <Image
            source={u.photoUrl ? { uri: u.photoUrl } : require('./assets/profile-placeholder.png')}
            style={{ width: 120, height: 120, borderRadius: 60 }}
          />
          <View style={{
            position: 'absolute', right: 6, bottom: 6, width: 18, height: 18, borderRadius: 9,
            backgroundColor: u.isVerified ? '#22c55e' : '#cbd5e1', borderWidth: 2, borderColor: '#fff'
          }} />
        </View>
        <Text style={{ marginTop: 10, fontSize: 18, fontWeight: '700' }}>
          {u.displayName || 'User'}
        </Text>
      </View>

      <View style={{ marginTop: 24, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2 }}>
        <LabelValue label="Username" value={u.displayName || '—'} />
        <Divider />
        <LabelValue label="About" value={u.about || '—'} multiline />
        <Divider />
        <LabelValue
          label="Professions"
          value={(u?.professions?.length ? u.professions.join(', ') : '—')}
        />
        <Divider />
        <LabelValue label="Status" value={u?.employmentStatus || '—'} />
        {(u?.employmentStatus === 'working' || u?.employmentStatus === 'student') ? (
          <>
            <Divider />
            <LabelValue
              label={u.employmentStatus === 'working' ? 'Company' : 'University'}
              value={u?.organizationName || '—'}
            />
          </>
        ) : null}
        <Divider />
        <LabelValue
          label="Last known location"
          value={
            u.lastKnownCoords
              ? `${u.lastKnownCoords.latitude.toFixed(5)}, ${u.lastKnownCoords.longitude.toFixed(5)}`
              : 'Unknown'
          }
        />
      </View>

      <Text style={{ marginTop: 22, fontSize: 16, fontWeight: '700' }}>
        Previous jobs completed
      </Text>

      {loadingHistory ? (
        <View style={[styles.center, { paddingVertical: 20 }]}>
          <ActivityIndicator size="small" color="#0066cc" />
        </View>
      ) : history.length === 0 ? (
        <Text style={{ color: '#667', marginTop: 8 }}>No completed jobs yet.</Text>
      ) : (
        history.map((j) => (
          <View key={j.id} style={{ marginTop: 12, backgroundColor: '#fff', borderRadius: 12, padding: 12, elevation: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ fontWeight: '700' }}>{(j.category || 'Job').toUpperCase()}</Text>
              <StatusChip status={j.status} />
            </View>
            {j.completionImageUrl ? (
              <Image source={{ uri: j.completionImageUrl }} style={{ width: '100%', height: 150, borderRadius: 8, marginTop: 8 }} />
            ) : j.imageUrl ? (
              <Image source={{ uri: j.imageUrl }} style={{ width: '100%', height: 150, borderRadius: 8, marginTop: 8 }} />
            ) : null}
            <Text style={{ marginTop: 8 }}>{j.description}</Text>
            <Text style={{ marginTop: 6, color: '#666' }}>
              Finished: {new Date(j.paidAt || j.completedAt || j.expiresAt).toLocaleString()}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

/* ===================== Profile (own) / Edit / Verify ===================== */
function ProfileScreen({ navigation, user, coords, profile, onEdit, onSignOut }) {
  const isComplete = !!profile?.displayName && !!profile?.about && !!profile?.photoUrl;
  const [completedAsBidder, setCompletedAsBidder] = useState([]);


  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      collection(db, 'jobs'),
      where('assignedBidderUid', '==', user.uid),
      where('status', 'in', ['completed', 'paid'])
    );
    const unsub = onSnapshot(q, (snap) => {
      const rows = [];
      snap.forEach((d) => rows.push({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ta = new Date(a.paidAt || a.completedAt || 0).getTime();
        const tb = new Date(b.paidAt || b.completedAt || 0).getTime();
        return tb - ta;
      });
      setCompletedAsBidder(rows);
    });
    return () => unsub();
  }, [user?.uid]);

  if (!isComplete) {
    return (
      <View style={styles.container}>
        <Image
          source={profile?.photoUrl ? { uri: profile.photoUrl } : require('./assets/profile-placeholder.png')}
          style={{ width: 100, height: 100, borderRadius: 50, marginBottom: 20 }}
        />
        <Text style={styles.title}>Complete your profile</Text>
        <TouchableOpacity style={[styles.button, { width: '80%' }]} onPress={onEdit}>
          <Text style={styles.buttonText}>Complete Profile</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.buttonOutline, { width: '80%', marginTop: 16 }]} onPress={onSignOut}>
          <Text style={styles.buttonOutlineText}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <View style={{ alignItems: 'center', marginTop: 10 }}>
        <View>
          <Image source={{ uri: profile.photoUrl }} style={{ width: 120, height: 120, borderRadius: 60 }} />
          <View style={{
            position: 'absolute', right: 6, bottom: 6, width: 18, height: 18, borderRadius: 9,
            backgroundColor: profile?.isVerified ? '#22c55e' : '#cbd5e1', borderWidth: 2, borderColor: '#fff'
          }} />
        </View>
        <TouchableOpacity
          onPress={onEdit}
          style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#0066cc' }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Edit Image</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 24, backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 2 }}>
        <LabelValue label="Username" value={profile.displayName} />
        <Divider />
        <LabelValue label="Email" value={user?.email || '—'} />
        <Divider />
        <LabelValue
          label="Current Location"
          value={coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : 'Unknown'}
        />
        <Divider />
        <LabelValue label="About" value={profile.about} multiline />
        <Divider />
        <LabelValue
          label="Professions"
          value={(profile?.professions?.length ? profile.professions.join(', ') : '—')}
        />
        <Divider />
        <LabelValue label="Status" value={profile?.employmentStatus || '—'} />
        {(profile?.employmentStatus === 'working' || profile?.employmentStatus === 'student') ? (
          <>
            <Divider />
            <LabelValue
              label={profile.employmentStatus === 'working' ? 'Company' : 'University'}
              value={profile?.organizationName || '—'}
            />
          </>
        ) : null}
      </View>
      {/* ---- Completed Jobs section (as bidder) ---- */}
      <View style={{ marginTop: 24 }}>
        <Text style={{ fontWeight: '700', fontSize: 16, marginBottom: 8 }}>Completed jobs</Text>

        {completedAsBidder.length === 0 ? (
          <Text style={{ color: '#667' }}>No completed jobs yet.</Text>
        ) : (
          completedAsBidder.map((j) => (
            <View
              key={j.id}
              style={{ backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 12, elevation: 2 }}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ fontWeight: '700' }}>{j.category?.toUpperCase() || 'JOB'}</Text>
                {typeof StatusChip === 'function' ? (
                  <StatusChip status={j.status} />
                ) : (
                  <Text style={{ color: '#555' }}>{j.status?.toUpperCase()}</Text>
                )}
              </View>

              {j.completionImageUrl ? (
                <Image
                  source={{ uri: j.completionImageUrl }}
                  style={{ width: '100%', height: 140, borderRadius: 8, marginTop: 8 }}
                />
              ) : null}

              <Text style={{ marginTop: 6 }}>{j.description}</Text>
              {j.details ? <Text style={{ marginTop: 4, color: '#555' }}>{j.details}</Text> : null}

              {(j.paidAt || j.completedAt) && (
                <Text style={{ marginTop: 6, color: '#667' }}>
                  Finished: {new Date(j.paidAt || j.completedAt).toLocaleString()}
                </Text>
              )}
            </View>
          ))
        )}
      </View>

      {!profile?.isVerified && (
        <TouchableOpacity style={[styles.buttonOutline, { marginTop: 24 }]} onPress={() => navigation.navigate('VerifyProfile')}>
          <Text style={styles.buttonOutlineText}>Start Verification</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={[styles.buttonOutline, { marginTop: 16 }]} onPress={onSignOut}>
        <Text style={styles.buttonOutlineText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function EditProfileScreen({ user, coords, profile, onSave }) {
  const [displayName, setDisplayName] = useState(profile?.displayName || '');
  const [about, setAbout] = useState(profile?.about || '');
  const [photoUri, setPhotoUri] = useState(profile?.photoUrl || null);
  const [professions, setProfessions] = useState(Array.isArray(profile?.professions) ? profile.professions : []);
  const [employmentStatus, setEmploymentStatus] = useState(profile?.employmentStatus || 'other');
  const [organizationName, setOrganizationName] = useState(profile?.organizationName || '');
  const [busy, setBusy] = useState(false);

  const pickProfileImage = async () => {
    try {
      let perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Permission needed', 'Please allow photo access in Settings.', [
          { text: 'Cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }
        ]);
        return;
      }
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaType?.Images ?? ImagePicker.MediaTypeOptions?.Images,
        quality: 0.8, allowsEditing: true, aspect: [1, 1],
      });
      if (!res.canceled) {
        const uri = res.assets?.[0]?.uri;
        if (uri) setPhotoUri(uri);
      }
    } catch (e) {
      console.error('Image picker error:', e);
      Alert.alert('Image picker error', e?.message ?? String(e));
    }
  };

  const save = async () => {
    if (!displayName || !about || !photoUri) {
      return Alert.alert('Missing fields', 'Please add name, about, and a profile image.');
    }
    if ((employmentStatus === 'working' || employmentStatus === 'student') && !organizationName.trim()) {
      return Alert.alert('Missing info', `Please enter your ${employmentStatus === 'working' ? 'company' : 'university'} name.`);
    }
    setBusy(true);
    try {
      await onSave({
        displayName, about, photoUri,
        professions,
        employmentStatus,
        organizationName: organizationName.trim(),
      });
    } catch (e) {
      Alert.alert('Save failed', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <View style={{ alignItems: 'center', marginTop: 10 }}>
        <Image
          source={photoUri ? { uri: photoUri } : require('./assets/profile-placeholder.png')}
          style={{ width: 120, height: 120, borderRadius: 60 }}
        />
        <TouchableOpacity
          onPress={pickProfileImage}
          style={{ marginTop: 12, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#0066cc' }}
        >
          <Text style={{ color: '#fff', fontWeight: '600' }}>Choose Image</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 24 }}>
        <Text style={styles.fieldLabel}>Username</Text>
        <TextInput value={displayName} onChangeText={setDisplayName} placeholder="Your name" style={styles.input} />

        <Text style={styles.fieldLabel}>Email (read-only)</Text>
        <TextInput editable={false} value={user?.email || ''} style={[styles.input, { backgroundColor: '#eee' }]} />

        <Text style={styles.fieldLabel}>Current Location</Text>
        <TextInput
          editable={false}
          value={coords ? `${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)}` : 'Unknown'}
          style={[styles.input, { backgroundColor: '#eee' }]}
        />

        <Text style={styles.fieldLabel}>About</Text>
        <TextInput
          value={about} onChangeText={setAbout} multiline numberOfLines={4}
          placeholder="Tell something about yourself…" style={[styles.input, { height: 100, textAlignVertical: 'top' }]}
        />

        <Text style={styles.fieldLabel}>Professions (select one or more)</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
          {PROFESSION_OPTIONS.map((p) => {
            const selected = professions.includes(p);
            return (
              <TouchableOpacity
                key={p}
                onPress={() => {
                  setProfessions((prev) => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);
                }}
                style={{
                  paddingVertical: 8, paddingHorizontal: 12, borderRadius: 16,
                  marginRight: 8, marginBottom: 8,
                  backgroundColor: selected ? '#0066cc' : '#eef2f7',
                  borderWidth: selected ? 0 : 1, borderColor: '#d0d7e2'
                }}
              >
                <Text style={{ color: selected ? '#fff' : '#333', fontWeight: '600', fontSize: 13 }}>{p}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={styles.fieldLabel}>Current Status</Text>
        <View style={[styles.input, { padding: 0 }]}>
          <Picker selectedValue={employmentStatus} onValueChange={setEmploymentStatus}>
            <Picker.Item label="Working" value="working" />
            <Picker.Item label="Student" value="student" />
            <Picker.Item label="Other" value="other" />
          </Picker>
        </View>

        {(employmentStatus === 'working' || employmentStatus === 'student') && (
          <>
            <Text style={styles.fieldLabel}>
              {employmentStatus === 'working' ? 'Company Name' : 'University Name'}
            </Text>
            <TextInput
              value={organizationName} onChangeText={setOrganizationName}
              placeholder={employmentStatus === 'working' ? 'e.g. TCS' : 'e.g. IIT Bombay'}
              style={styles.input}
            />
          </>
        )}
      </View>

      <TouchableOpacity style={[styles.button, { marginTop: 16 }]} onPress={save} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Saving…' : 'Save Profile'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function VerifyProfileScreen({ navigation }) {
  const [busy, setBusy] = useState(false);

  const requestVerification = async () => {
    if (!auth.currentUser) return;
    try {
      setBusy(true);
      await setDoc(doc(db, 'users', auth.currentUser.uid), { verificationRequested: true }, { merge: true });
      Alert.alert('Verification requested', 'We’ll review your document. Your info remains private.');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 20 }}>
      <Text style={styles.title}>Verify your profile</Text>
      <Text style={{ marginTop: 8, color: '#555' }}>
        To get the green verified badge, submit a government ID. Your document will be kept private and used only for verification.
      </Text>

      <TouchableOpacity style={[styles.button, { marginTop: 20, opacity: busy ? 0.7 : 1 }]}
        onPress={requestVerification} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'Submitting…' : 'Request Verification'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

/* ===================== UI helpers & styles ===================== */
function Section({ title, children }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{ fontWeight: '600', marginBottom: 8 }}>{title}</Text>
      {children}
    </View>
  );
}
function RadioRow({ label, selected, onPress, sublabel }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
      <View
        style={{
          width: 18, height: 18, borderRadius: 9,
          borderWidth: 2, borderColor: '#0066cc', alignItems: 'center', justifyContent: 'center', marginRight: 10
        }}
      >
        {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#0066cc' }} /> : null}
      </View>
      <Text style={{ fontSize: 16 }}>{label}</Text>
      {sublabel ? <Text style={{ marginLeft: 8, color: '#666' }}>({sublabel})</Text> : null}
    </TouchableOpacity>
  );
}
function LabelValue({ label, value, multiline }) {
  return (
    <View style={{ paddingVertical: 8 }}>
      <Text style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: 16, lineHeight: multiline ? 22 : 18 }}>{value}</Text>
    </View>
  );
}
function Divider() { return <View style={{ height: 1, backgroundColor: '#eee', marginVertical: 6 }} />; }

function StatusChip({ status }) {
  const map = {
    open: { bg: '#dcfce7', bd: '#86efac', fg: '#15803d', label: 'OPEN' },
    assigned: { bg: '#fee2e2', bd: '#fecaca', fg: '#b91c1c', label: 'ASSIGNED' },
    completed: { bg: '#fef9c3', bd: '#fde68a', fg: '#a16207', label: 'COMPLETED' },
    paid: { bg: '#e0e7ff', bd: '#c7d2fe', fg: '#3730a3', label: 'PAID' }
  };
  const s = map[status] || map.open;
  return (
    <View style={{
      paddingVertical: 4, paddingHorizontal: 8, borderRadius: 12,
      backgroundColor: s.bg, borderWidth: 1, borderColor: s.bd
    }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: s.fg }}>{s.label}</Text>
    </View>
  );
}

function InfoBanner({ title, subtitle, onPress, tone = 'info', fullPress = false }) {
  const bg = tone === 'success' ? '#ecfdf5' : '#eff6ff';
  const border = tone === 'success' ? '#a7f3d0' : '#bfdbfe';
  const titleColor = tone === 'success' ? '#065f46' : '#1e40af';
  const subColor = '#334155';
  const Box = fullPress ? TouchableOpacity : View;
  return (
    <Box
      onPress={onPress}
      activeOpacity={0.85}
      style={{
        backgroundColor: bg, borderColor: border, borderWidth: 1,
        borderRadius: 12, padding: 14, marginBottom: 12
      }}
    >
      <Text style={{ fontSize: 16, fontWeight: '800', color: titleColor }}>{title}</Text>
      <Text style={{ marginTop: 4, color: subColor }}>{subtitle}</Text>
      {!fullPress && (
        <TouchableOpacity style={[styles.button, { marginTop: 10, paddingVertical: 10 }]} onPress={onPress}>
          <Text style={styles.buttonText}>Open Job</Text>
        </TouchableOpacity>
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: {
    flex: 1, backgroundColor: '#f5f7fa', alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  logo: { fontSize: 28, fontWeight: '700', color: '#0066cc', marginBottom: 20, textAlign: 'center' },
  card: {
    width: '100%', maxWidth: 350, backgroundColor: '#fff',
    borderRadius: 12, padding: 20, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
  },
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, fontSize: 16, backgroundColor: '#f9f9f9',
  },
  fieldLabel: { fontSize: 12, color: '#666', marginBottom: 6 },
  button: { backgroundColor: '#0066cc', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  buttonOutline: { borderWidth: 2, borderColor: '#0066cc', borderRadius: 8, paddingVertical: 14, alignItems: 'center' },
  buttonOutlineText: { color: '#0066cc', fontWeight: '600', fontSize: 16 },
  placeholderBox: { width: '100%', height: 120, backgroundColor: '#e9eef5', borderRadius: 10, borderWidth: 1, borderColor: '#dde3ea' },

  footerBar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  footerBtn: {
    flex: 1,
    backgroundColor: '#eef2f7',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d0d7e2',
  },
  footerBtnText: { fontWeight: '700', color: '#1f2937' },
});
